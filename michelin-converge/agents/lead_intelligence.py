from agents import hooks, prompts, security
from agents.tools import invoke_tool

REQUIRED_FOR_RECOMMENDATION = ["vehicle_type", "usage"]
LOW_CONFIDENCE_THRESHOLD = 0.5


def run(raw_text: str, ctx: dict = None) -> dict:
    """Turn raw lead text into a structured profile. Security harness runs
    first (Layer-1 deterministic scan, PII redaction, Layer-2 LLM sentinel).
    Never recommends a product/price/dealer."""
    ctx = ctx or {}

    # -- Security hook: Layer-1 deterministic scan --
    scan = invoke_tool("security.scan_input", "lead_intelligence", {"text": raw_text}, trace=ctx.get("trace"))["result"]
    ctx.setdefault("hook_events", []).append({"stage": "before_agent", "event": "l1_security_scan",
                                              "level": scan["level"], "flags": scan["flags"]})

    if security.is_blocked(scan):
        # Hard stop before any model call. No extraction, no guessing.
        return {
            "vehicle": None, "vehicle_type": None, "usage": None, "budget": None,
            "requested_discount_pct": None, "wants_four_tyres": False, "location": None,
            "purchase_intent": "low", "urgency": "low", "detected_language": "unknown",
            "is_out_of_scope": True, "out_of_scope_category": "security_block",
            "confidence": 0.0, "missing_fields": ["all"],
            "needs_clarification": False, "security_blocked": True,
            "security_flags": scan["flags"],
        }

    # -- PII redaction before anything leaves the process --
    redacted = invoke_tool("pii.redact", "lead_intelligence", {"text": raw_text}, trace=ctx.get("trace"))["result"]
    if redacted["count"]:
        ctx.setdefault("hook_events", []).append({"stage": "before_agent", "event": "pii_redaction",
                                                  "tokens": redacted["count"]})

    # -- Layer-2 LLM sentinel (can escalate, never un-block) --
    scan = hooks.security_sentinel_check("lead_intelligence", redacted["redacted_text"], scan, ctx)
    ctx["security_report"] = scan
    if security.is_blocked(scan):
        return {
            "vehicle": None, "vehicle_type": None, "usage": None, "budget": None,
            "requested_discount_pct": None, "wants_four_tyres": False, "location": None,
            "purchase_intent": "low", "urgency": "low", "detected_language": "unknown",
            "is_out_of_scope": True, "out_of_scope_category": "security_block",
            "confidence": 0.0, "missing_fields": ["all"],
            "needs_clarification": False, "security_blocked": True,
            "security_flags": scan["flags"],
        }

    result = hooks.guarded_call(
        "lead_intelligence", prompts.LEAD_INTELLIGENCE_USER_TEMPLATE,
        ctx=payload_ctx(ctx), payloads={"raw_text": redacted["redacted_text"]},
    )

    if "_error" in result:
        return {
            "vehicle": None, "vehicle_type": None, "usage": None, "budget": None,
            "requested_discount_pct": None, "wants_four_tyres": False, "location": None,
            "purchase_intent": "low", "urgency": "low", "detected_language": "unknown",
            "is_out_of_scope": False, "out_of_scope_category": None, "confidence": 0.0,
            "missing_fields": ["all"], "_agent_error": result["_error"],
            "needs_clarification": False, "security_flags": scan["flags"],
        }

    # Deterministic guardrail: recompute missing_fields from actual values.
    missing = [f for f in REQUIRED_FOR_RECOMMENDATION if not result.get(f)]
    result["missing_fields"] = sorted(set(result.get("missing_fields") or []) | set(missing))

    confidence = result.get("confidence")
    if not isinstance(confidence, (int, float)):
        result["confidence"] = 0.0

    result["needs_clarification"] = (
        result["confidence"] < LOW_CONFIDENCE_THRESHOLD or len(result["missing_fields"]) > 0
    ) and not result.get("is_out_of_scope")
    result["security_flags"] = scan["flags"]
    return result


def payload_ctx(ctx):
    return ctx if "lead_id" in ctx else ctx