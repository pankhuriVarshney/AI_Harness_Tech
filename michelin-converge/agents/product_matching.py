import json
from agents.gemini_client import call_gemini_json
from agents import prompts


def _rule_based_match(profile: dict, catalog: list) -> list:
    """Deterministic fallback matcher used when the LLM hallucinates a SKU
    or fails outright. Filters the real catalogue by vehicle type, usage tag
    and budget so we always have a safe, real answer to fall back on."""
    vehicle_type = profile.get("vehicle_type")
    usage = profile.get("usage")
    budget = profile.get("budget")

    candidates = catalog
    if vehicle_type:
        filtered = [c for c in candidates if vehicle_type in c.get("vehicle_types", [])]
        candidates = filtered or candidates
    if usage:
        filtered = [c for c in candidates if usage in c.get("usage_tags", [])]
        candidates = filtered or candidates
    if budget:
        within_budget = [c for c in candidates if c["price"] <= budget * 1.15]
        candidates = within_budget or candidates

    candidates = sorted(candidates, key=lambda c: abs(c["price"] - (budget or c["price"])))
    return candidates


def run(profile: dict, catalog: list) -> dict:
    catalog_ids = {c["id"] for c in catalog}

    user_prompt = prompts.PRODUCT_MATCHING_USER_TEMPLATE.format(
        profile_json=json.dumps(profile),
        catalog_json=json.dumps(catalog),
    )
    result = call_gemini_json(prompts.PRODUCT_MATCHING_SYSTEM, user_prompt)

    llm_failed = "_error" in result
    sku = None if llm_failed else result.get("recommended_sku")
    alternatives = [] if llm_failed else [a for a in (result.get("alternatives") or []) if a in catalog_ids]
    reason = result.get("reason", "")
    confidence = result.get("confidence", 0.0) if not llm_failed else 0.0

    # --- Deterministic guardrail: the model may ONLY return real SKUs ---
    hallucinated = bool(sku) and sku not in catalog_ids
    sku_validated = bool(sku) and sku in catalog_ids

    if hallucinated or (not sku_validated):
        fallback = _rule_based_match(profile, catalog)
        if fallback:
            best = fallback[0]
            sku = best["id"]
            alternatives = [c["id"] for c in fallback[1:3]]
            reason = (
                f"Deterministic catalogue matcher selected {best['model']} "
                f"({best['size']}) based on vehicle type, usage and budget."
                if not hallucinated else
                f"Model proposed a SKU not present in the catalogue; rejected and "
                f"replaced with deterministic match: {best['model']} ({best['size']})."
            )
            confidence = 0.6
            no_match = False
        else:
            sku = None
            alternatives = []
            reason = "No catalogue product reasonably matches this lead's requirements."
            confidence = 0.0
            no_match = True
    else:
        no_match = False

    return {
        "recommended_sku": sku,
        "confidence": confidence,
        "alternatives": alternatives,
        "reason": reason,
        "sku_hallucination_detected": hallucinated,
        "no_match": no_match,
    }
