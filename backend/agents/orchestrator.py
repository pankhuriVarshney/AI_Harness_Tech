"""
Orchestrator — the agentic control layer.

Responsibilities (each is a named harness mechanism, not just "glue code"):
  - STATE: per-lead state object threaded through every agent
  - BRANCHING: skips/reorders agents based on structured outputs
  - SUBAGENT SPAWNING: deal_optimization -> negotiation (registry-gated, depth 1)
  - HANDOFFS: compliance_critic -> deal_optimization revision loop (max 1)
  - HOOKS: ctx carries hook_events + trace; every model/tool call logs there
  - GRACEFUL DEGRADATION: every failure path returns a valid state, never a crash
"""

import time
import uuid
from datetime import datetime, timezone

from agents import (compliance_critic, dealer_allocation, deal_optimization,
                    lead_intelligence, lead_scoring, product_matching,
                    prompts, registry)


def _now_iso():
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


class Trace:
    """Execution trace: agent steps + tool calls, both demoable in the UI."""

    def __init__(self, lead_id: str):
        self.lead_id = lead_id
        self.steps = []
        self.tool_calls = []

    def log(self, agent_name, started_at, output, ok=True, note="", ctx=None):
        step = {
            "timestamp": _now_iso(),
            "agent": agent_name,
            "duration_ms": round((time.time() - started_at) * 1000),
            "ok": ok,
            "note": note,
            "output": output,
        }
        if ctx is not None and ctx.get("hook_events"):
            step["hook_events"] = ctx["hook_events"]
            ctx["hook_events"] = []
        self.steps.append(step)

    def record_tool_call(self, tool, role, args, result, ok=True):
        self.tool_calls.append({
            "timestamp": _now_iso(),
            "tool": tool,
            "invoked_by": role,
            "args": _safe(args),
            "result_ok": ok,
            "result": _safe(result),
        })


def _safe(v, depth=0):
    """Keep traces readable: cap string lengths and collection sizes."""
    if depth > 4:
        return "…"
    if isinstance(v, dict):
        return {k: _safe(x, depth + 1) for k, x in list(v.items())[:30]}
    if isinstance(v, list):
        return [_safe(x, depth + 1) for x in v[:10]]
    if isinstance(v, str) and len(v) > 400:
        return v[:400] + "…"
    return v


def _new_ctx(lead_id, trace):
    return {"lead_id": lead_id, "trace": trace, "hook_events": []}


def process_lead(raw_text: str, customer_lat, customer_lng, catalog: list,
                 policy: dict, distributors: list, lead_id: str = None) -> dict:
    lead_id = lead_id or f"LEAD-{uuid.uuid4().hex[:6].upper()}"
    trace = Trace(lead_id)
    ctx = _new_ctx(lead_id, trace)

    state = {
        "lead_id": lead_id,
        "profile": None, "lead_score": None, "priority": None,
        "recommendation": None, "deal": None, "dealer": None,
        "compliance": None, "retry_count": 0, "handoff_count": 0,
        "escalate_to_human": False, "status": "PROCESSING",
        "recommended_action": None, "sales_note": None,
        "security": None,
    }

    # ---- Agent 1: Lead Intelligence (with security harness) ----
    t0 = time.time()
    profile = lead_intelligence.run(raw_text, ctx)
    state["profile"] = profile
    state["security"] = {"blocked": bool(profile.get("security_blocked")),
                         "flags": profile.get("security_flags") or []}
    trace.log("Lead Intelligence", t0, profile, ok="_agent_error" not in profile and not profile.get("security_blocked"), ctx=ctx)

    if profile.get("security_blocked"):
        state["status"] = "SECURITY_BLOCK"
        state["escalate_to_human"] = True
        state["recommended_action"] = "HUMAN_REVIEW"
        state["sales_note"] = ("Input blocked by the deterministic security harness "
                               f"({', '.join(profile.get('security_flags') or ['policy violation'])}). "
                               "No model was allowed to process this text.")
        return _finalize(state, trace)

    if profile.get("is_out_of_scope"):
        state["status"] = "OUT_OF_SCOPE"
        state["escalate_to_human"] = True
        state["recommended_action"] = "HUMAN_REVIEW"
        state["sales_note"] = (
            f"Out-of-scope request detected (category: {profile.get('out_of_scope_category')}). "
            "The AI does not answer legal/warranty/safety questions. Routed to a human.")
        return _finalize(state, trace)

    if profile.get("needs_clarification"):
        state["status"] = "NEEDS_CLARIFICATION"
        state["recommended_action"] = "REQUEST_INFO"
        state["sales_note"] = (
            "Missing or low-confidence information: "
            + ", ".join(profile.get("missing_fields") or ["unspecified"])
            + ". The harness will not guess a recommendation from incomplete data.")
        return _finalize(state, trace)

    # ---- Agent 2: Lead Scoring ----
    t0 = time.time()
    scoring = lead_scoring.run(profile, ctx)
    state["lead_score"] = scoring["lead_score"]
    state["priority"] = scoring["priority"]
    trace.log("Lead Scoring", t0, scoring, ctx=ctx)

    # ---- Agent 3: Product Matching (retry-on-no-match) ----
    t0 = time.time()
    recommendation = product_matching.run(profile, catalog, ctx)
    trace.log("Product Matching", t0, recommendation,
              ok=not recommendation.get("no_match"), ctx=ctx)

    if recommendation.get("no_match"):
        state["retry_count"] += 1
        t0 = time.time()
        recommendation = product_matching.run(profile, catalog, ctx)
        trace.log("Product Matching (retry)", t0, recommendation,
                  ok=not recommendation.get("no_match"),
                  note="retry after no-match", ctx=ctx)
        if recommendation.get("no_match"):
            state["recommendation"] = recommendation
            state["status"] = "NO_PRODUCT_MATCH"
            state["escalate_to_human"] = True
            state["recommended_action"] = "HUMAN_REVIEW"
            state["sales_note"] = ("No catalogue product matches this lead even after a retry. "
                                   "Escalated to a human for a manual/custom quote.")
            return _finalize(state, trace)

    state["recommendation"] = recommendation
    matched = next((c for c in catalog if c["id"] == recommendation.get("recommended_sku")), None)
    price = matched["price"] if matched else 0

    # ---- Agent 4: Deal Optimization (+ negotiation subagent) ----
    t0 = time.time()
    deal = deal_optimization.run(price, profile, policy, ctx)
    state["deal"] = deal
    trace.log("Deal Optimization", t0, deal, ok=not deal.get("exceeds_policy"), ctx=ctx)

    # ---- Agent 5: Dealer Allocation (deterministic) ----
    t0 = time.time()
    dealer = dealer_allocation.run(recommendation.get("recommended_sku"),
                                   customer_lat, customer_lng, distributors, ctx)
    state["dealer"] = dealer
    trace.log("Dealer Allocation", t0, dealer, ok=bool(dealer.get("recommended_dealer")), ctx=ctx)

    # ---- Agent 6: Compliance Critic (+ bounded handoff loop) ----
    max_handoffs = registry.get("compliance_critic").get("max_handoff_loops", 1)
    negotiation_feedback = None
    while True:
        t0 = time.time()
        compliance = compliance_critic.run(state, policy, raw_text, ctx)
        state["compliance"] = compliance
        trace.log("Compliance Critic", t0, compliance, ok=compliance.get("approved"), ctx=ctx)

        if compliance.get("revise_deal") and state["handoff_count"] < max_handoffs:
            # HANDOFF: critic -> deal agent, one bounded revision
            state["handoff_count"] += 1
            neg = state["deal"].get("negotiation") or {}
            negotiation_feedback = (
                f"Compliance requested a revision: {'; '.join(compliance.get('reasons')[:2])}. "
                f"Negotiation simulator noted: {neg.get('rationale', 'n/a')}"
            )
            ctx.setdefault("hook_events", []).append({
                "stage": "orchestration", "event": "handoff",
                "from": "compliance_critic", "to": "deal_optimization",
                "loop": state["handoff_count"]})
            t0 = time.time()
            deal = deal_optimization.run(price, profile, policy, ctx,
                                         negotiation_feedback=negotiation_feedback)
            state["deal"] = deal
            trace.log("Deal Optimization (revision)", t0, deal, note="handoff from compliance", ctx=ctx)
            continue
        break

    # ---- Final decision ----
    if compliance.get("escalate_to_human") or not compliance.get("approved"):
        state["escalate_to_human"] = True
        state["status"] = "ESCALATED"
        state["recommended_action"] = "HUMAN_REVIEW"
        state["sales_note"] = compliance.get("customer_safe_summary")
    else:
        state["escalate_to_human"] = False
        state["status"] = "READY"
        state["recommended_action"] = {"HIGH": "CONTACT_NOW", "MEDIUM": "FOLLOW_UP"}.get(
            state["priority"], "NURTURE")
        state["sales_note"] = recommendation.get("reason", "")

    return _finalize(state, trace)


def _finalize(state, trace):
    state["harness"] = {
        "prompt_version": prompts.PROMPT_VERSION,
        "registry_agents": len(registry.AGENT_REGISTRY),
        "handoffs": state.get("handoff_count", 0),
        "subagent_spawned": bool((state.get("deal") or {}).get("subagent_spawned")),
    }
    return {"state": state, "trace": trace.steps, "tool_calls": trace.tool_calls}