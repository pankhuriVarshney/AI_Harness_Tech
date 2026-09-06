import json
from agents.gemini_client import call_gemini_json
from agents import prompts

RESTRICTED_KEYWORDS = {
    "warranty": ["warranty", "warrant"],
    "legal": ["legal", "lawsuit", "sue", "liability", "entitled", "law"],
    "safety": ["injury", "injured", "hurt", "accident", "burst", "blew out", "exploded"],
    "recall": ["recall", "defect", "defective"],
}


def _keyword_flags(raw_text: str) -> list:
    text = (raw_text or "").lower()
    flags = []
    for category, words in RESTRICTED_KEYWORDS.items():
        if any(w in text for w in words):
            flags.append(category)
    return flags


def run(state: dict, policy: dict, raw_text: str = "") -> dict:
    # --- Deterministic risk flags computed by code, independent of the LLM ---
    risk_flags = []

    profile = state.get("profile") or {}
    deal = state.get("deal") or {}
    recommendation = state.get("recommendation") or {}
    dealer = state.get("dealer") or {}

    if profile.get("is_out_of_scope"):
        risk_flags.append(f"out_of_scope:{profile.get('out_of_scope_category') or 'unspecified'}")

    keyword_flags = _keyword_flags(raw_text)
    for kf in keyword_flags:
        risk_flags.append(f"restricted_topic_keyword:{kf}")

    if deal.get("exceeds_policy"):
        risk_flags.append("policy_violation:discount_exceeds_max")

    if deal and deal.get("recommended_discount_pct", 0) > policy.get("max_discount_pct", 8) + 2:
        risk_flags.append("policy_violation:clamped_discount_still_high")

    if recommendation.get("sku_hallucination_detected"):
        risk_flags.append("data_integrity:sku_hallucination_detected_and_corrected")

    if recommendation.get("no_match") or not recommendation.get("recommended_sku"):
        risk_flags.append("unresolved:no_product_match")

    if not dealer.get("recommended_dealer"):
        risk_flags.append("unresolved:no_dealer_available")

    if profile.get("needs_clarification"):
        risk_flags.append("unresolved:missing_lead_information")

    user_prompt = prompts.COMPLIANCE_CRITIC_USER_TEMPLATE.format(
        state_json=json.dumps(state, default=str),
        policy_json=json.dumps(policy),
        risk_flags_json=json.dumps(risk_flags),
    )
    result = call_gemini_json(prompts.COMPLIANCE_CRITIC_SYSTEM, user_prompt)

    llm_failed = "_error" in result
    approved = False if llm_failed else bool(result.get("approved", False))
    escalate = True if llm_failed else bool(result.get("escalate_to_human", False))
    reasons = [] if llm_failed else list(result.get("reasons") or [])
    summary = result.get(
        "customer_safe_summary",
        "This lead requires human review before a sales action is confirmed.",
    )

    # --- Deterministic override: any hard risk flag forces escalation no
    # matter what the LLM concluded. The critic cannot approve its way
    # around a code-detected violation. ---
    hard_flags = [f for f in risk_flags if f.startswith("out_of_scope") or f.startswith("restricted_topic_keyword") or f.startswith("policy_violation")]
    if hard_flags:
        approved = False
        escalate = True
        reasons = sorted(set(reasons) | set(hard_flags))

    return {
        "approved": approved,
        "escalate_to_human": escalate,
        "reasons": reasons,
        "customer_safe_summary": summary,
        "risk_flags": risk_flags,
    }
