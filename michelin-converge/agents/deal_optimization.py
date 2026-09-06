from agents.gemini_client import call_gemini_json
from agents import prompts


def run(price: float, profile: dict, policy: dict) -> dict:
    max_discount = policy["max_discount_pct"]
    budget = profile.get("budget")
    requested_discount_pct = profile.get("requested_discount_pct")
    wants_four = profile.get("wants_four_tyres", False)

    user_prompt = prompts.DEAL_OPTIMIZATION_USER_TEMPLATE.format(
        price=price,
        budget=budget,
        requested_discount_pct=requested_discount_pct,
        max_discount_pct=max_discount,
        wants_four_tyres=wants_four,
        purchase_intent=profile.get("purchase_intent"),
    )
    result = call_gemini_json(prompts.DEAL_OPTIMIZATION_SYSTEM, user_prompt)

    proposed = result.get("recommended_discount_pct")
    reason = result.get("reason")
    if "_error" in result or not isinstance(proposed, (int, float)):
        # Deterministic fallback: aim for the smallest discount that reaches
        # the stated budget, never exceeding policy.
        if budget and budget < price:
            needed_pct = round((1 - budget / price) * 100)
            proposed = max(0, needed_pct)
        else:
            proposed = 0
        reason = "Deterministic fallback: smallest discount estimated to approach stated budget."

    effective_policy_max = max_discount + (
        policy.get("bundle_rules", {}).get("four_tyres", {}).get("additional_discount_pct", 0)
        if wants_four else 0
    )

    # --- Deterministic guardrail: LLM never has the final say on the number ---
    exceeds_policy = bool(requested_discount_pct and requested_discount_pct > effective_policy_max)
    recommended_discount_pct = max(0, min(round(proposed), effective_policy_max))

    final_total = round(price * (1 - recommended_discount_pct / 100))

    return {
        "original_price": price,
        "requested_discount_pct": requested_discount_pct,
        "recommended_discount_pct": recommended_discount_pct,
        "policy_max_discount_pct": effective_policy_max,
        "final_total": final_total,
        "exceeds_policy": exceeds_policy,
        "reason": reason,
        # Hard-coded by code, never left to the model's wording:
        "disclaimer": policy.get("quote_disclaimer", "Subject to distributor confirmation."),
    }
