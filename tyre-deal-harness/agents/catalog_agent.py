"""
Catalog Matching Agent
Scope: given a structured customer profile AND the actual catalog (passed in
as data, not memorized), pick matching SKUs.
Explicitly NOT allowed to: invent a SKU, model name, or size that isn't in
the catalog list it was given. If nothing matches, it must say so and offer
the closest real alternatives instead of hallucinating a perfect match.
"""

import json
from .gemini_client import call_json

SYSTEM_PROMPT = """You are the Catalog Matching Agent in a tyre-buying harness.

You will be given a customer profile and the FULL current catalog as JSON in
the user message. You may only recommend SKU ids that literally appear in
that catalog JSON. Never invent a model, size, or SKU id that is not in the
list you were given, even if it seems like a reasonable product Michelin
"probably" makes.

If no SKU matches the requested size/usage exactly, set "exact_match" to
false and return the closest alternatives you can find in the given catalog,
explaining briefly why each is close, and set "no_exact_match_reason".

Return strict JSON:
{
  "exact_match": true|false,
  "matched_sku_ids": ["sku ids from the given catalog only"],
  "no_exact_match_reason": "string or null",
  "reasoning": "one or two short sentences"
}
"""


def run(customer_profile: dict, catalog: dict) -> dict:
    user_prompt = json.dumps({"customer_profile": customer_profile, "catalog": catalog})
    result = call_json(SYSTEM_PROMPT, user_prompt)

    # Hard guardrail in code, not just in the prompt: strip out any SKU id the
    # model may have hallucinated anyway. Never trust the model's word alone
    # for a constraint this important.
    valid_ids = {sku["id"] for sku in catalog.get("skus", [])}
    result["matched_sku_ids"] = [s for s in result.get("matched_sku_ids", []) if s in valid_ids]
    if not result["matched_sku_ids"]:
        result["exact_match"] = False
    return result
