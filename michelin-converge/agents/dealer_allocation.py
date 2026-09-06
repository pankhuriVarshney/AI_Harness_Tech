import math


def _haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return None
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(r * 2 * math.asin(math.sqrt(a)), 1)


def run(sku: str, customer_lat, customer_lng, distributors: list) -> dict:
    """Purely deterministic per the spec: distance/stock/inventory are
    structured data problems, not something an LLM should be guessing at.
    Never invents a distributor or stock status that isn't in `distributors`.
    """
    if not sku:
        return {
            "recommended_dealer": None, "dealer_id": None, "distance_km": None,
            "stock_available": False, "reason": "No validated product to allocate a dealer for.",
            "alternatives": [],
        }

    ranked = []
    for d in distributors:
        stock = sku in d.get("stock", [])
        distance = _haversine_km(customer_lat, customer_lng, d.get("lat"), d.get("lng"))
        conversion = d.get("conversion_rate", {}).get("default", 0.0)
        ranked.append({
            "id": d["id"], "name": d["name"], "stock": stock,
            "distance_km": distance, "conversion": conversion,
            "capacity": d.get("capacity_leads_per_day", 0),
        })

    # Priority: stock -> distance (nulls last) -> conversion -> capacity
    ranked.sort(key=lambda d: (
        not d["stock"],
        d["distance_km"] if d["distance_km"] is not None else 9999,
        -d["conversion"],
        -d["capacity"],
    ))

    if not ranked or not ranked[0]["stock"]:
        in_stock = [d for d in ranked if d["stock"]]
        if not in_stock:
            return {
                "recommended_dealer": None, "dealer_id": None, "distance_km": None,
                "stock_available": False,
                "reason": "No distributor in the provided list currently stocks this SKU.",
                "alternatives": [],
            }
        ranked = in_stock + [d for d in ranked if not d["stock"]]

    best = ranked[0]
    alternatives = [d["name"] for d in ranked[1:3]]

    reason_parts = []
    if best["stock"]:
        reason_parts.append("in stock")
    if best["distance_km"] is not None:
        reason_parts.append(f"{best['distance_km']} km away")
    reason_parts.append(f"{int(best['conversion']*100)}% historical conversion on similar leads")

    return {
        "recommended_dealer": best["name"],
        "dealer_id": best["id"],
        "distance_km": best["distance_km"],
        "stock_available": best["stock"],
        "reason": "Requested SKU is " + ", ".join(reason_parts) + ".",
        "alternatives": alternatives,
    }
