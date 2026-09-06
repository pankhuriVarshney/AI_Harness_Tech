import time
import uuid
from datetime import datetime, timezone

from agents import lead_intelligence, lead_scoring, product_matching, deal_optimization, dealer_allocation, compliance_critic


def _now_iso():
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


class Trace:
    def __init__(self, lead_id: str):
        self.lead_id = lead_id
        self.steps = []

    def log(self, agent_name: str, started_at: float, output: dict, ok: bool = True, note: str = ""):
        self.steps.append({
            "timestamp": _now_iso(),
            "agent": agent_name,
            "duration_ms": round((time.time() - started_at) * 1000),
            "ok": ok,
            "note": note,
            "output": output,
        })


def process_lead(raw_text: str, customer_lat, customer_lng, catalog: list, policy: dict, distributors: list, lead_id: str = None) -> dict:
    lead_id = lead_id or f"LEAD-{uuid.uuid4().hex[:6].upper()}"
    trace = Trace(lead_id)

    state = {
        "lead_id": lead_id,
        "profile": None,
        "lead_score": None,
        "priority": None,
        "recommendation": None,
        "deal": None,
        "dealer": None,
        "compliance": None,
        "retry_count": 0,
        "escalate_to_human": False,
        "status": "PROCESSING",
        "recommended_action": None,
        "sales_note": None,
    }

    # ---- Agent 1: Lead Intelligence ----
    t0 = time.time()
    profile = lead_intelligence.run(raw_text)
    state["profile"] = profile
    trace.log("Lead Intelligence", t0, profile, ok="_agent_error" not in profile)

    if profile.get("is_out_of_scope"):
        # Branch: out-of-scope (warranty/legal/safety) -> straight to human,
        # never attempt to score/recommend/quote for it.
        state["status"] = "OUT_OF_SCOPE"
        state["escalate_to_human"] = True
        state["recommended_action"] = "HUMAN_REVIEW"
        state["sales_note"] = (
            f"Out-of-scope request detected (category: {profile.get('out_of_scope_category')}). "
            "The AI does not answer legal/warranty/safety questions. Routed to a human."
        )
        return {"state": state, "trace": trace.steps}

    if profile.get("needs_clarification"):
        # Branch: low confidence / missing critical fields -> stop and ask,
        # do not guess a score, product, or offer.
        state["status"] = "NEEDS_CLARIFICATION"
        state["recommended_action"] = "REQUEST_INFO"
        state["sales_note"] = (
            "Missing or low-confidence information: "
            + ", ".join(profile.get("missing_fields") or ["unspecified"])
            + ". The harness will not guess a recommendation from incomplete data."
        )
        return {"state": state, "trace": trace.steps}

    # ---- Agent 2: Lead Scoring (deterministic rubric + LLM narrative) ----
    t0 = time.time()
    scoring = lead_scoring.run(profile)
    state["lead_score"] = scoring["lead_score"]
    state["priority"] = scoring["priority"]
    trace.log("Lead Scoring", t0, scoring)

    # ---- Agent 3: Product Matching (with retry-on-no-match) ----
    t0 = time.time()
    recommendation = product_matching.run(profile, catalog)
    trace.log("Product Matching", t0, recommendation, ok=not recommendation.get("no_match"))

    if recommendation.get("no_match"):
        state["retry_count"] += 1
        t0 = time.time()
        recommendation = product_matching.run(profile, catalog)
        trace.log("Product Matching (retry)", t0, recommendation, ok=not recommendation.get("no_match"), note="retry after no-match")

        if recommendation.get("no_match"):
            state["recommendation"] = recommendation
            state["status"] = "NO_PRODUCT_MATCH"
            state["escalate_to_human"] = True
            state["recommended_action"] = "HUMAN_REVIEW"
            state["sales_note"] = "No catalogue product matches this lead even after a retry. Escalated to a human for a manual/custom quote."
            return {"state": state, "trace": trace.steps}

    state["recommendation"] = recommendation

    # ---- Agent 4: Deal Optimization ----
    matched_product = next((c for c in catalog if c["id"] == recommendation.get("recommended_sku")), None)
    price = matched_product["price"] if matched_product else 0
    t0 = time.time()
    deal = deal_optimization.run(price, profile, policy)
    state["deal"] = deal
    trace.log("Deal Optimization", t0, deal, ok=not deal.get("exceeds_policy"))

    # ---- Agent 5: Dealer Allocation (deterministic) ----
    t0 = time.time()
    dealer = dealer_allocation.run(recommendation.get("recommended_sku"), customer_lat, customer_lng, distributors)
    state["dealer"] = dealer
    trace.log("Dealer Allocation", t0, dealer, ok=bool(dealer.get("recommended_dealer")))

    # ---- Agent 6: Compliance & Sales Critic (independent review) ----
    t0 = time.time()
    compliance = compliance_critic.run(state, policy, raw_text)
    state["compliance"] = compliance
    trace.log("Compliance Critic", t0, compliance, ok=compliance.get("approved"))

    # ---- Orchestrator final decision ----
    if compliance.get("escalate_to_human") or not compliance.get("approved"):
        state["escalate_to_human"] = True
        state["status"] = "ESCALATED"
        state["recommended_action"] = "HUMAN_REVIEW"
        state["sales_note"] = compliance.get("customer_safe_summary")
    else:
        state["escalate_to_human"] = False
        state["status"] = "READY"
        if state["priority"] == "HIGH":
            state["recommended_action"] = "CONTACT_NOW"
        elif state["priority"] == "MEDIUM":
            state["recommended_action"] = "FOLLOW_UP"
        else:
            state["recommended_action"] = "NURTURE"
        state["sales_note"] = recommendation.get("reason", "")

    return {"state": state, "trace": trace.steps}
