import json

from agents import hooks, prompts, security
from agents.tools import invoke_tool


def run(state: dict, policy: dict, raw_text: str = "", ctx: dict = None) -> dict:
    ctx = ctx or {}
    risk_flags = []
    profile = state.get("profile") or {}
    deal = state.get("deal") or {}
    recommendation = state.get("recommendation") or {}
    dealer = state.get("dealer") or {}

    # --- Deterministic risk flags (code, independent of any LLM) ---
    if profile.get("is_out_of_scope"):
        risk_flags.append(f"out_of_scope:{profile.get('out_of_scope_category') or 'unspecified'}")
    if profile.get("security_blocked"):
        risk_flags.append("security:blocked_input")
    for sf in (profile.get("security_flags") or []):
        risk_flags.append(f"security:{sf}")

    scan = invoke_tool("security.scan_input", "compliance_critic", {"text": raw_text or ""},
                       trace=ctx.get("trace"))["result"]
    for kf in scan["flags"]:
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

    # --- Independent discount re-verification via tool (not trusting state) ---
    if deal:
        reverify = invoke_tool("policy.effective_max_discount", "compliance_critic",
                               {"policy": policy,
                                "wants_four": bool(profile.get("wants_four_tyres"))},
                               trace=ctx.get("trace"))["result"]
        if deal.get("recommended_discount_pct", 0) > reverify["max_pct"]:
            risk_flags.append("policy_violation:discount_reverification_failed")

    result = hooks.guarded_call(
        "compliance_critic", prompts.COMPLIANCE_CRITIC_USER_TEMPLATE, ctx=ctx,
        payloads={"state_json": state, "policy_json": policy,
                  "risk_flags_json": risk_flags,
                  "security_flags_json": profile.get("security_flags") or []},
    )

    llm_failed = "_error" in result
    approved = False if llm_failed else bool(result.get("approved", False))
    escalate = True if llm_failed else bool(result.get("escalate_to_human", False))
    revise = False if llm_failed else bool(result.get("revise_deal", False))
    reasons = [] if llm_failed else list(result.get("reasons") or [])
    summary = result.get("customer_safe_summary",
                         "This lead requires human review before a sales action is confirmed.")

    # --- Output guard: no PII/secret shapes may reach the frontend ---
    guard = security.guard_output(summary)
    if not guard["clean"]:
        risk_flags += [f"output_guard:{f}" for f in guard["flags"]]
        summary = "This lead requires human review before a sales action is confirmed."

    # --- Hard veto: code-detected violations cannot be approved away ---
    hard_prefixes = ("out_of_scope", "restricted_topic_keyword", "policy_violation", "security:")
    hard = [f for f in risk_flags if f.startswith(hard_prefixes)]
    if hard:
        approved, escalate = False, True
        revise = False
        reasons = sorted(set(reasons) | set(hard))

    return {
        "approved": approved,
        "escalate_to_human": escalate,
        "revise_deal": revise,
        "reasons": reasons,
        "customer_safe_summary": summary,
        "risk_flags": risk_flags,
    }