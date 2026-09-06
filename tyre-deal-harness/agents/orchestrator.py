"""
Orchestrator
This IS the harness. It doesn't do any customer-facing reasoning itself -
it holds conversation state across turns and decides which agent runs next,
including the graceful-degradation paths when an agent's output isn't good
enough to proceed on.

State per session (kept in memory - swap for Redis/DB for anything real):
{
  "profile": last known intake profile (merged across turns),
  "attempts_without_match": counter for the "no_catalog_match_after_2_attempts" escalation,
  "trace": list of {agent, output} for this turn - this is what the UI/demo shows
}
"""

import json
import os

from . import intake_agent, catalog_agent, deal_agent, locator_agent, critic_agent
from .gemini_client import call_text

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def _load_json(name):
    with open(os.path.join(_DATA_DIR, name)) as f:
        return json.load(f)


CATALOG = _load_json("catalog.json")
POLICY = _load_json("policy.json")
DISTRIBUTORS = _load_json("distributors.json")

_SESSIONS = {}

REPLY_SYSTEM_PROMPT = """You write the single customer-facing message for a
tyre-buying harness, given a structured summary of what the backend agents
decided. Write naturally and warmly in the customer's detected language,
never robotically. Do not invent any fact not present in the summary you are
given - your only job is to phrase it well, not to add information.
"""


def _get_session(session_id):
    if session_id not in _SESSIONS:
        _SESSIONS[session_id] = {"profile": {}, "attempts_without_match": 0, "history": []}
    return _SESSIONS[session_id]


def handle_message(session_id: str, message: str, customer_lat=None, customer_lng=None) -> dict:
    session = _get_session(session_id)
    trace = []

    # 1. Intake
    intake = intake_agent.run(message)
    trace.append({"agent": "intake", "output": intake})

    if intake.get("confidence", 0) < 0.4:
        # Graceful degradation: don't guess, ask instead of guessing.
        reply = call_text(
            REPLY_SYSTEM_PROMPT,
            json.dumps({
                "situation": "low_confidence_intake",
                "missing_fields": intake.get("missing_critical_fields", []),
                "detected_language": intake.get("detected_language", "en"),
            }),
        )
        return _respond(trace, reply, escalate=False)

    # Merge into running profile so multi-turn conversations accumulate facts.
    session["profile"].update({k: v for k, v in intake.items() if v not in (None, [], "")})

    # 2. Catalog match
    match = catalog_agent.run(session["profile"], CATALOG)
    trace.append({"agent": "catalog_match", "output": match})

    if not match["matched_sku_ids"]:
        session["attempts_without_match"] += 1
        if session["attempts_without_match"] >= 2:
            reply = call_text(
                REPLY_SYSTEM_PROMPT,
                json.dumps({
                    "situation": "no_match_after_2_attempts_escalate",
                    "detected_language": intake.get("detected_language", "en"),
                }),
            )
            return _respond(trace, reply, escalate=True,
                             escalation_reasons=["No catalog match after 2 attempts"])
        reply = call_text(
            REPLY_SYSTEM_PROMPT,
            json.dumps({
                "situation": "no_exact_match_offer_alternatives",
                "reason": match.get("no_exact_match_reason"),
                "detected_language": intake.get("detected_language", "en"),
            }),
        )
        return _respond(trace, reply, escalate=False)

    session["attempts_without_match"] = 0
    matched_skus = [s for s in CATALOG["skus"] if s["id"] in match["matched_sku_ids"]]

    # 3. Deal
    deal = deal_agent.run(matched_skus, POLICY, session["profile"].get("customer_requested_discount_pct"))
    trace.append({"agent": "deal", "output": deal})

    # 4. Locator (deterministic - no LLM)
    locator = locator_agent.run(customer_lat, customer_lng, match["matched_sku_ids"], DISTRIBUTORS)
    trace.append({"agent": "locator", "output": locator})

    # 5. Critic - last checkpoint before anything reaches the customer
    draft_transaction = {
        "customer_message": message,
        "intake": intake,
        "match": match,
        "deal": deal,
        "locator": locator,
    }
    critique = critic_agent.run(draft_transaction)
    trace.append({"agent": "critic", "output": critique})

    if critique.get("escalate_to_human"):
        return _respond(trace, critique.get("customer_safe_summary", ""),
                         escalate=True, escalation_reasons=critique.get("escalation_reasons", []))

    # 6. Final phrasing - only after the Critic has approved the facts
    reply = call_text(REPLY_SYSTEM_PROMPT, json.dumps({
        "situation": "quote_ready",
        "matched_skus": matched_skus,
        "deal": deal,
        "distributors": locator.get("candidates", []),
        "detected_language": intake.get("detected_language", "en"),
    }))
    return _respond(trace, reply, escalate=False, deal=deal, distributors=locator.get("candidates", []))


def _respond(trace, reply, escalate, escalation_reasons=None, deal=None, distributors=None):
    return {
        "reply": reply,
        "escalate_to_human": escalate,
        "escalation_reasons": escalation_reasons or [],
        "deal": deal,
        "distributors": distributors,
        "trace": trace,  # full per-agent trace - this is what the demo/UI shows to prove it's a harness, not one model
    }
