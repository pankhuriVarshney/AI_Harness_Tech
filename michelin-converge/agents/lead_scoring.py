import json
from agents.gemini_client import call_gemini_json
from agents import prompts

# Deterministic rubric - this is the authoritative scoring logic. The LLM is
# only ever used to phrase *why*, never to decide the number, per the spec's
# hard constraint that critical scoring rules must live in code.
MAX_POINTS = {
    "urgency": 25,
    "budget": 20,
    "vehicle": 15,
    "tyre_requirement": 20,
    "location": 10,
    "intent": 10,
}


def _score(profile: dict) -> tuple[int, dict]:
    breakdown = {}

    urgency_map = {"high": 25, "medium": 15, "low": 5}
    breakdown["urgency"] = urgency_map.get(profile.get("urgency"), 0)

    breakdown["budget"] = MAX_POINTS["budget"] if profile.get("budget") else 0

    breakdown["vehicle"] = MAX_POINTS["vehicle"] if profile.get("vehicle") or profile.get("vehicle_type") else 0

    breakdown["tyre_requirement"] = MAX_POINTS["tyre_requirement"] if profile.get("usage") else 0

    breakdown["location"] = MAX_POINTS["location"] if profile.get("location") else 0

    intent_map = {"high": 10, "medium": 6, "low": 2}
    breakdown["intent"] = intent_map.get(profile.get("purchase_intent"), 0)

    total = sum(breakdown.values())
    return total, breakdown


def _priority(score: int) -> str:
    if score >= 75:
        return "HIGH"
    if score >= 45:
        return "MEDIUM"
    return "LOW"


def run(profile: dict) -> dict:
    lead_score, breakdown = _score(profile)
    priority = _priority(lead_score)

    user_prompt = prompts.LEAD_SCORING_USER_TEMPLATE.format(
        profile_json=json.dumps(profile),
        lead_score=lead_score,
        priority=priority,
        breakdown_json=json.dumps(breakdown),
    )
    result = call_gemini_json(prompts.LEAD_SCORING_SYSTEM, user_prompt)

    reasons = result.get("reason") if isinstance(result.get("reason"), list) else None
    if not reasons:
        # Deterministic fallback narrative if the LLM call failed - the
        # dashboard must still show *something* factual, never a blank field.
        reasons = [f"{k.replace('_', ' ').title()}: {v}/{MAX_POINTS[k]} points" for k, v in breakdown.items() if v > 0]

    return {
        "lead_score": lead_score,
        "priority": priority,
        "breakdown": breakdown,
        "reason": reasons,
    }
