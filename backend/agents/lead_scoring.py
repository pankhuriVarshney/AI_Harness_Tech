import json

from agents import hooks, prompts
from agents.tools import invoke_tool


def run(profile: dict, ctx: dict = None) -> dict:
    ctx = ctx or {}
    # The NUMBER comes from the deterministic tool — never from the model.
    scoring = invoke_tool("lead.compute_score", "lead_scoring", {"profile": profile},
                          trace=ctx.get("trace"))["result"]

    result = hooks.guarded_call(
        "lead_scoring", prompts.LEAD_SCORING_USER_TEMPLATE,
        ctx=ctx,
        payloads={"profile_json": profile, "lead_score": scoring["lead_score"],
                  "priority": scoring["priority"], "breakdown_json": scoring["breakdown"]},
    )

    reasons = result.get("reason") if isinstance(result.get("reason"), list) else None
    if not reasons:
        # Deterministic fallback narrative — dashboard never shows a blank.
        reasons = [f"{k.replace('_', ' ').title()}: {v}/{scoring['max_points'][k]} points"
                   for k, v in scoring["breakdown"].items() if v > 0]

    return {
        "lead_score": scoring["lead_score"],
        "priority": scoring["priority"],
        "breakdown": scoring["breakdown"],
        "reason": reasons,
    }