from agents import hooks, negotiation, prompts
from agents.tools import invoke_tool


def run(price: float, profile: dict, policy: dict, ctx: dict = None,
        negotiation_feedback: str = None, _spawn_depth: int = 0) -> dict:
    ctx = ctx or {}
    budget = profile.get("budget")
    requested = profile.get("requested_discount_pct")
    wants_four = profile.get("wants_four_tyres", False)

    cap = invoke_tool("policy.effective_max_discount", "deal_optimization",
                      {"policy": policy, "wants_four": wants_four},
                      trace=ctx.get("trace"))["result"]["max_pct"]

    tool_manifest = json_manifest()
    result = hooks.guarded_call(
        "deal_optimization", prompts.DEAL_OPTIMIZATION_USER_TEMPLATE, ctx=ctx,
        payloads={"price": price, "budget": budget, "requested_discount_pct": requested,
                  "max_discount_pct": cap, "wants_four_tyres": wants_four,
                  "purchase_intent": profile.get("purchase_intent"),
                  "negotiation_feedback": negotiation_feedback or prompts.NEGOTIATION_FEEDBACK_NONE},
        system_prompt=prompts.DEAL_OPTIMIZATION_SYSTEM.format(tool_manifest=tool_manifest),
    )

    proposed = result.get("recommended_discount_pct")
    reason = result.get("reason")
    if "_error" in result or not isinstance(proposed, (int, float)):
        # Deterministic fallback: smallest discount estimated to reach budget.
        if budget and budget < price:
            proposed = max(0, round((1 - budget / price) * 100))
        else:
            proposed = 0
        reason = "Deterministic fallback: smallest discount estimated to approach stated budget."

    # --- Deterministic guardrail: policy.clamp_discount tool has final say ---
    clamp = invoke_tool("policy.clamp_discount", "deal_optimization",
                        {"proposed_pct": proposed, "requested_pct": requested,
                         "policy": policy, "wants_four": wants_four},
                        trace=ctx.get("trace"))["result"]

    quote = invoke_tool("quote.finalize", "deal_optimization",
                        {"price": price, "discount_pct": clamp["clamped_discount_pct"],
                         "policy": policy, "wants_four": wants_four},
                        trace=ctx.get("trace"))["result"]

    # --- Spawn negotiation subagent (depth-limited, registry-gated) ---
    subagent_out = None
    if _spawn_depth < 1:
        subagent_out = negotiation.run(price, clamp["clamped_discount_pct"], profile, cap, ctx)
        ctx.setdefault("hook_events", []).append({
            "stage": "orchestration", "event": "subagent_spawn",
            "parent": "deal_optimization", "child": "negotiation",
            "depth": _spawn_depth + 1,
            "customer_accepts": subagent_out.get("customer_accepts")})

    return {
        "original_price": price,
        "requested_discount_pct": requested,
        "recommended_discount_pct": clamp["clamped_discount_pct"],
        "policy_max_discount_pct": clamp["policy_cap_pct"],
        "final_total": quote["final_total"],
        "exceeds_policy": clamp["exceeds_policy"],
        "was_clamped": clamp["was_clamped"],
        "reason": reason,
        "disclaimer": quote["disclaimer"],
        "negotiation": subagent_out,
        "subagent_spawned": subagent_out is not None,
    }


def json_manifest():
    import json
    return json.dumps([
        {"name": "policy.effective_max_discount", "when": "the real ceiling incl. bundle bonus"},
        {"name": "policy.clamp_discount", "when": "final say on any proposed pct"},
        {"name": "quote.finalize", "when": "totals + mandatory disclaimer"},
    ])