"""
Deal Agent
Scope: propose a bundle and a discount for the matched SKUs, using the
matched products' real prices and the policy file's bounds.
Explicitly NOT allowed to: exceed policy.max_discount_pct, or state a price
as final/binding. Every quote is indicative pending distributor confirmation.
"""

import json
from .gemini_client import call_json

SYSTEM_PROMPT = """You are the Deal Agent in a tyre-buying harness.

You will get the matched products (with real prices) and the discount
policy as JSON. Propose a bundle and discount percentage.

Hard rule: your proposed discount_pct must NEVER exceed policy.max_discount_pct.
If the customer's message (given to you as customer_requested_discount_pct,
which may be null) asks for more than that, propose the maximum allowed
instead and set "exceeds_policy" to true so the harness can escalate - do not
silently give a bigger discount to make the customer happy.

Always include the policy's final_price_disclaimer verbatim in your output.

Return strict JSON:
{
  "proposed_sku_ids": ["..."],
  "discount_pct": 0,
  "exceeds_policy": true|false,
  "total_before_discount_inr": 0,
  "total_after_discount_inr": 0,
  "disclaimer": "the policy's final_price_disclaimer text"
}
"""


def run(matched_skus: list, policy: dict, customer_requested_discount_pct=None) -> dict:
    user_prompt = json.dumps({
        "matched_skus": matched_skus,
        "policy": policy,
        "customer_requested_discount_pct": customer_requested_discount_pct,
    })
    result = call_json(SYSTEM_PROMPT, user_prompt)

    # Code-level guardrail: clamp regardless of what the model produced.
    max_pct = policy.get("max_discount_pct", 0)
    if result.get("discount_pct", 0) > max_pct:
        result["discount_pct"] = max_pct
        result["exceeds_policy"] = True
    if customer_requested_discount_pct and customer_requested_discount_pct > max_pct:
        result["exceeds_policy"] = True
    result["disclaimer"] = policy.get("final_price_disclaimer", result.get("disclaimer", ""))
    return result
