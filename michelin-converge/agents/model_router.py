"""
Model Router — orchestration-tier model selection.

Route table (override via env; check https://ai.google.dev/gemini-api/docs/models
for current names before deploying):
  fast      -> cheap/low-latency tier: extraction, scoring narrative, matching
  reasoning -> stronger tier: compliance critic, security sentinel

Mechanics:
  - Fallback chain: if the primary model errors, try the fallback once.
  - Per-lead call budget: agents share a fixed LLM-call allowance per lead
    (HARNESS_CALL_BUDGET). Exhaustion degrades agents to their deterministic
    fallbacks instead of unbounded spend.
  - Circuit breaker: N consecutive failures opens the breaker for a cooldown
    window; calls short-circuit to {"_error": ...} so the pipeline degrades
    gracefully instead of hammering a failing API.
"""

import os
import time

from agents import gemini_client

ROUTE_TABLE = {
    "fast": {
        "env": "GEMINI_MODEL_FAST",
        "default": "gemini-2.0-flash",
        "fallback_env": "GEMINI_MODEL_FAST_FALLBACK",
        "fallback_default": "gemini-2.0-flash",
    },
    "reasoning": {
        "env": "GEMINI_MODEL_REASONING",
        "default": "gemini-2.0-flash",  # set to a Pro model in .env for production
        "fallback_env": "GEMINI_MODEL_FAST",
        "fallback_default": "gemini-2.0-flash",
    },
}

CALL_BUDGET_PER_LEAD = int(os.environ.get("HARNESS_CALL_BUDGET", "12"))
CIRCUIT_FAILURE_THRESHOLD = int(os.environ.get("CIRCUIT_FAILURE_THRESHOLD", "4"))
CIRCUIT_COOLDOWN_SEC = float(os.environ.get("CIRCUIT_COOLDOWN_SEC", "30"))

_lead_call_counts = {}
_consecutive_failures = 0
_breaker_open_until = 0.0


def resolve_route(tier: str) -> list:
    """Return [primary, fallback] model names for a tier."""
    r = ROUTE_TABLE.get(tier, ROUTE_TABLE["fast"])
    return [
        os.environ.get(r["env"], r["default"]),
        os.environ.get(r["fallback_env"], r["fallback_default"]),
    ]


def _budget_available(lead_id) -> bool:
    if lead_id is None:
        return True
    return _lead_call_counts.get(lead_id, 0) < CALL_BUDGET_PER_LEAD


def _spend(lead_id):
    if lead_id is not None:
        _lead_call_counts[lead_id] = _lead_call_counts.get(lead_id, 0) + 1


def _record_failure():
    global _consecutive_failures, _breaker_open_until
    _consecutive_failures += 1
    if _consecutive_failures >= CIRCUIT_FAILURE_THRESHOLD:
        _breaker_open_until = time.time() + CIRCUIT_COOLDOWN_SEC


def _record_success():
    global _consecutive_failures
    _consecutive_failures = 0


def call_json(system_prompt: str, user_prompt: str, tier: str = "fast", lead_id=None) -> dict:
    """Route a JSON call: budget check -> circuit breaker -> primary -> fallback."""
    if not _budget_available(lead_id):
        return {"_error": f"LLM call budget exhausted for lead (max {CALL_BUDGET_PER_LEAD})",
                "_budget_exceeded": True}
    if time.time() < _breaker_open_until:
        return {"_error": "LLM circuit breaker open (cooldown)",
                "_circuit_open": True, "_retry_after_s": round(_breaker_open_until - time.time(), 1)}

    primary, fallback = resolve_route(tier)
    for i, model_name in enumerate([primary, fallback]):
        _spend(lead_id)
        try:
            text = gemini_client.generate_text(model_name, system_prompt, user_prompt)
            result = gemini_client.extract_json(text)
            _record_success()
            result["_model_used"] = model_name
            result["_model_tier"] = tier
            return result
        except Exception as exc:  # noqa: BLE001 - routing must survive anything
            _record_failure()
            last = str(exc)
            if i == 0:
                continue
            return {"_error": last, "_model_used": model_name, "_model_tier": tier}
    return {"_error": "unreachable"}


def stats() -> dict:
    return {
        "lead_call_counts": dict(_lead_call_counts),
        "consecutive_failures": _consecutive_failures,
        "circuit_open": time.time() < _breaker_open_until,
        "routes": {t: resolve_route(t) for t in ROUTE_TABLE},
        "call_budget_per_lead": CALL_BUDGET_PER_LEAD,
    }