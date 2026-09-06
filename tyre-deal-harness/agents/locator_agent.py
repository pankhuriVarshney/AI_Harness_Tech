"""
Locator Agent
Scope: find the nearest distributor(s) that actually stock the matched SKUs.
Deliberately NOT an LLM call - distance and stock lookup is a deterministic
problem, and using a model for it would just add latency and a new failure
mode for no benefit. Good harness design means only using an agent-as-LLM
where judgment is actually needed.
"""

import math


def _haversine_km(lat1, lng1, lat2, lng2):
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def run(customer_lat, customer_lng, matched_sku_ids: list, distributors: dict, top_n: int = 3) -> dict:
    if customer_lat is None or customer_lng is None:
        return {"resolved": False, "reason": "no_customer_location", "candidates": []}

    scored = []
    for d in distributors.get("distributors", []):
        dist_km = _haversine_km(customer_lat, customer_lng, d["lat"], d["lng"])
        has_stock = any(sku in d.get("stock", []) for sku in matched_sku_ids)
        scored.append({**d, "distance_km": round(dist_km, 1), "has_requested_stock": has_stock})

    scored.sort(key=lambda d: (not d["has_requested_stock"], d["distance_km"]))
    return {"resolved": True, "candidates": scored[:top_n]}
