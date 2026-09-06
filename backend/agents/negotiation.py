"""Negotiation Simulator — a SUBAGENT.

Spawned only by deal_optimization (registry-enforced), max spawn depth 1.
It stress-tests a proposed discount by role-playing the customer, and may
recommend one in-policy revision. It cannot touch policy, catalog, or
dealer data — it only sees the numbers its parent passes it.
"""

from agents import hooks, prompts


def run(price: float, proposed_pct: float, profile: dict, policy_cap_pct: int, ctx: dict = None) -> dict:
    ctx = dict(ctx or {})
    ctx["subagent"] = True
    result = hooks.guarded_call(
        "negotiation", prompts.NEGOTIATION_USER_TEMPLATE, ctx=ctx,
        payloads={"price": price, "proposed_pct": proposed_pct,
                  "budget": profile.get("budget"),
                  "requested_discount_pct": profile.get("requested_discount_pct"),
                  "purchase_intent": profile.get("purchase_intent"),
                  "policy_cap_pct": policy_cap_pct},
    )
    if "_error" in result:
        # Subagent failure is non-fatal: parent proceeds with its own proposal.
        return {"customer_accepts": True, "counter_discount_pct": proposed_pct,
                "recommended_revision_pct": None,
                "rationale": "Negotiation simulator unavailable; proceeding with proposed offer.",
                "_subagent_degraded": True}
    revision = result.get("recommended_revision_pct")
    if revision is not None and revision > policy_cap_pct:
        revision = policy_cap_pct  # subagent can never expand policy
    result["recommended_revision_pct"] = revision
    return result