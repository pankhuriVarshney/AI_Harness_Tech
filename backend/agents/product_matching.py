import json

from agents import hooks, prompts
from agents.tools import invoke_tool


def run(profile: dict, catalog: list, ctx: dict = None) -> dict:
    ctx = ctx or {}
    catalog_ids = {c["id"] for c in catalog}
    tool_manifest = json.dumps([
        {"name": "catalog.search", "when": "ground-truth ranking of candidates"},
        {"name": "catalog.validate_skus", "when": "verify any SKU you propose"},
    ])

    result = hooks.guarded_call(
        "product_matching", prompts.PRODUCT_MATCHING_USER_TEMPLATE, ctx=ctx,
        payloads={"profile_json": profile, "catalog_json": catalog},
        system_prompt=prompts.PRODUCT_MATCHING_SYSTEM.format(tool_manifest=tool_manifest),
    )

    llm_failed = "_error" in result
    sku = None if llm_failed else result.get("recommended_sku")
    alternatives = [] if llm_failed else [a for a in (result.get("alternatives") or []) if a in catalog_ids]
    reason = result.get("reason", "")
    confidence = result.get("confidence", 0.0) if not llm_failed else 0.0

    # --- Tool-backed validation: model may ONLY return real SKUs ---
    check = invoke_tool("catalog.validate_skus", "product_matching",
                        {"skus": [s for s in [sku] + alternatives if s], "catalog": catalog},
                        trace=ctx.get("trace"))["result"]
    hallucinated = bool(check["hallucinated"])
    sku_validated = bool(sku) and sku in check["valid"]

    if hallucinated or (not sku_validated):
        # Deterministic backstop via catalog.search tool.
        fallback = invoke_tool("catalog.search", "product_matching",
                               {"profile": profile, "catalog": catalog},
                               trace=ctx.get("trace"))["result"]
        if fallback:
            best = fallback[0]
            sku = best["id"]
            alternatives = [c["id"] for c in fallback[1:3]]
            reason = (
                f"Deterministic matcher selected {best['model']} ({best['size']}) by vehicle/usage/budget."
                if not hallucinated else
                f"Model proposed non-catalogue SKU {check['hallucinated'][0]}; rejected by validator and replaced with {best['model']} ({best['size']})."
            )
            confidence = 0.6
            no_match = False
        else:
            sku, alternatives, confidence, no_match = None, [], 0.0, True
            reason = "No catalogue product reasonably matches this lead's requirements."
    else:
        alternatives = [a for a in alternatives if a in check["valid"]]
        no_match = False

    return {
        "recommended_sku": sku,
        "confidence": confidence,
        "alternatives": alternatives,
        "reason": reason,
        "sku_hallucination_detected": hallucinated,
        "no_match": no_match,
    }