"""Fully deterministic agent — no LLM. Ranking is delegated to the
dealer.rank tool so the same implementation backs both the agent and the
/api/simulate endpoint."""

from agents.tools import invoke_tool


def run(sku: str, customer_lat, customer_lng, distributors: list, ctx: dict = None) -> dict:
    ctx = ctx or {}
    if not sku:
        return {"recommended_dealer": None, "dealer_id": None, "distance_km": None,
                "stock_available": False,
                "reason": "No validated product to allocate a dealer for.", "alternatives": []}

    ranked = invoke_tool("dealer.rank", "dealer_allocation",
                         {"sku": sku, "customer_lat": customer_lat,
                          "customer_lng": customer_lng, "distributors": distributors},
                         trace=ctx.get("trace"))["result"]

    in_stock = [d for d in ranked if d["stock"]]
    if not in_stock:
        return {"recommended_dealer": None, "dealer_id": None, "distance_km": None,
                "stock_available": False,
                "reason": "No distributor in the provided list currently stocks this SKU.",
                "alternatives": []}

    best = in_stock[0]
    alternatives = [d["name"] for d in in_stock[1:3]]
    parts = ["in stock"]
    if best["distance_km"] is not None:
        parts.append(f"{best['distance_km']} km away")
    parts.append(f"{int(best['conversion'] * 100)}% historical conversion on similar leads")

    return {
        "recommended_dealer": best["name"],
        "dealer_id": best["id"],
        "distance_km": best["distance_km"],
        "stock_available": True,
        "reason": "Requested SKU is " + ", ".join(parts) + ".",
        "alternatives": alternatives,
    }