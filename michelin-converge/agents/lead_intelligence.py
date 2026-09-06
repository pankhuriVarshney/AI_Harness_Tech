from agents.gemini_client import call_gemini_json
from agents import prompts

REQUIRED_FOR_RECOMMENDATION = ["vehicle_type", "usage"]
LOW_CONFIDENCE_THRESHOLD = 0.5


def run(raw_text: str) -> dict:
    """Turn raw lead text into a structured profile. Never recommends a
    product/price/dealer (enforced by the prompt; nothing to validate here
    because this agent has no catalogue/policy access at all)."""

    user_prompt = prompts.LEAD_INTELLIGENCE_USER_TEMPLATE.format(raw_text=raw_text)
    result = call_gemini_json(prompts.LEAD_INTELLIGENCE_SYSTEM, user_prompt)

    if "_error" in result:
        return {
            "vehicle": None, "vehicle_type": None, "usage": None, "budget": None,
            "requested_discount_pct": None, "wants_four_tyres": False,
            "location": None, "purchase_intent": "low", "urgency": "low",
            "detected_language": "unknown", "is_out_of_scope": False,
            "out_of_scope_category": None, "confidence": 0.0,
            "missing_fields": ["all"], "_agent_error": result["_error"],
            "needs_clarification": False,  # can't even ask a clarifying question reliably; let it flow to escalation
        }

    # Deterministic guardrail: never trust the model's own missing_fields
    # list blindly - recompute it from the actual field values so we don't
    # silently proceed with nulls it forgot to flag.
    missing = []
    for field in REQUIRED_FOR_RECOMMENDATION:
        if not result.get(field):
            missing.append(field)
    result["missing_fields"] = sorted(set(result.get("missing_fields") or []) | set(missing))

    confidence = result.get("confidence")
    if not isinstance(confidence, (int, float)):
        result["confidence"] = 0.0

    result["needs_clarification"] = (
        result["confidence"] < LOW_CONFIDENCE_THRESHOLD or len(result["missing_fields"]) > 0
    ) and not result.get("is_out_of_scope")

    return result
