"""
Hook Pipeline — deterministic middleware around every model call.

Stages, in order:
  1. before_model   : render prompt payloads with leveled compaction if the
                      prompt exceeds MAX_PROMPT_CHARS (L1 drop nulls/truncate
                      strings -> L2 cap lists -> L3 hard cap). Emits a
                      continuation note so the model knows compaction happened.
  2. call           : routed through model_router (budget + circuit breaker).
  3. after_model    : JSON lint against the agent's registry output schema,
                      then a deterministic *repair pass* (type coercion,
                      enum snapping, range clamping). Unrepairable output is
                      returned as {"_error", "_lint_errors"} so the agent's
                      deterministic fallback takes over — a malformed model
                      answer can never flow downstream raw.
  4. security_hook  : Layer-2 LLM security sentinel on untrusted input
                      (lead_intelligence only). Its verdict can escalate, but
                      a Layer-1 BLOCKED verdict always wins.

Every stage appends to ctx["hook_events"] so the trace panel can show the
middleware working, not just the agents.
"""

import json
import os

from agents import model_router, registry, prompts, security
from agents.tools import validate_against_schema

MAX_PROMPT_CHARS = int(os.environ.get("MAX_PROMPT_CHARS", "30000"))


# --------------------------------------------------------------------------
# Compaction
# --------------------------------------------------------------------------

def _compact_value(v, level: int):
    if level <= 0:
        return v
    if isinstance(v, dict):
        out = {}
        for k, val in v.items():
            if val is None and level >= 1:
                continue
            out[k] = _compact_value(val, level)
        return out
    if isinstance(v, list):
        cap = {1: 50, 2: 12, 3: 5}.get(level, 5)
        return [_compact_value(x, level) for x in v[:cap]]
    if isinstance(v, str):
        lim = {1: 160, 2: 80, 3: 40}.get(level, 40)
        return v if len(v) <= lim else v[:lim] + "…"
    return v


def render_with_compaction(template: str, payloads: dict, ctx: dict = None) -> str:
    """Format a prompt template with JSON-serialized payloads, escalating
    compaction levels until the result fits MAX_PROMPT_CHARS."""
    level = 0
    notes = []
    while True:
        rendered = template.format(**{
            k: json.dumps(_compact_value(v, level), default=str, separators=(",", ":"))
            for k, v in (payloads or {}).items()
        })
        if len(rendered) <= MAX_PROMPT_CHARS or level >= 3:
            break
        level += 1
        notes.append(f"L{level}")
    if notes and ctx is not None:
        ctx.setdefault("hook_events", []).append(
            {"stage": "before_model", "event": "compaction", "levels": notes,
             "final_chars": len(rendered)})
        rendered += ("\n\n[SYSTEM NOTE: some inputs were compacted to fit the "
                     "context budget: " + ", ".join(notes) + ". Work with what you have.]")
    return rendered


# --------------------------------------------------------------------------
# Lint + deterministic repair
# --------------------------------------------------------------------------

def _coerce(value, schema):
    """Best-effort deterministic repair of one value. Returns (value, actions)."""
    actions = []
    if not isinstance(schema, dict):
        return value, actions
    t = schema.get("type")
    types = t if isinstance(t, list) else [t] if t else []

    if "null" in types and value is None:
        return None, actions

    if isinstance(value, str) and ("number" in types or "integer" in types):
        try:
            n = float(value) if "number" in types else int(float(value))
            actions.append(f"coerced string '{value}' -> number")
            value = n
        except (ValueError, TypeError):
            pass

    if isinstance(value, str) and "boolean" in types and value.lower() in ("true", "false"):
        value = value.lower() == "true"
        actions.append("coerced string -> boolean")

    if isinstance(value, (int, float)) and "string" in types and not types == ["string"]:
        pass  # keep numbers numeric if number is also allowed

    if "enum" in schema and value not in schema["enum"] and value is not None:
        if isinstance(value, str):
            for e in schema["enum"]:
                if isinstance(e, str) and e.lower() == value.lower():
                    actions.append(f"snap enum '{value}' -> '{e}'")
                    return e, actions
        actions.append(f"nulled invalid enum value {value!r}")
        return None, actions

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        lo, hi = schema.get("minimum"), schema.get("maximum")
        if lo is not None and value < lo:
            actions.append(f"clamped {value} -> min {lo}")
            value = lo
        if hi is not None and value > hi:
            actions.append(f"clamped {value} -> max {hi}")
            value = hi

    if isinstance(value, dict):
        props = schema.get("properties", {})
        for k, sub in props.items():
            if k in value and value[k] is not None:
                value[k], a = _coerce(value[k], sub)
                actions += [f"{k}: {x}" for x in a]
    if isinstance(value, list) and "items" in schema:
        fixed = []
        for item in value:
            v2, a = _coerce(item, schema["items"])
            actions += a
            if v2 is not None or "null" in (schema["items"].get("type") if isinstance(schema["items"].get("type"), list) else [schema["items"].get("type")]):
                fixed.append(v2)
        if "maxItems" in schema and len(fixed) > schema["maxItems"]:
            actions.append(f"truncated list {len(fixed)} -> {schema['maxItems']} items")
            fixed = fixed[: schema["maxItems"]]
        value = fixed
    return value, actions


def lint_and_repair(agent_key: str, result: dict, ctx: dict = None) -> dict:
    """Validate model output against the registry schema; attempt one
    deterministic repair pass; return lint report alongside the value."""
    schema = registry.get(agent_key).get("output_schema")
    if schema is None:
        return result
    errors = validate_against_schema(result, schema)
    if not errors:
        return result

    repaired = json.loads(json.dumps(result))  # deep copy
    actions = []
    for prop, sub in schema.get("properties", {}).items():
        if prop in repaired:
            repaired[prop], a = _coerce(repaired[prop], sub)
            actions += a
    remaining = validate_against_schema(repaired, schema)
    if ctx is not None:
        ctx.setdefault("hook_events", []).append({
            "stage": "after_model", "event": "lint",
            "agent": agent_key, "initial_errors": errors,
            "repair_actions": actions, "remaining_errors": remaining})
    if remaining:
        return {"_error": f"output failed schema lint after repair: {'; '.join(remaining[:3])}",
                "_lint_errors": remaining, "_raw": result}
    result.clear()
    result.update(repaired)
    return result


# --------------------------------------------------------------------------
# Layer-2 security sentinel (LLM) — can escalate, never un-block
# --------------------------------------------------------------------------

def security_sentinel_check(agent_key: str, redacted_text: str, l1: dict, ctx: dict = None) -> dict:
    """LLM second opinion on untrusted input. Layer-1 verdict is final for
    BLOCKED; the sentinel may only escalate PASS/SUSPICIOUS."""
    if l1.get("level") == "BLOCKED":
        if ctx is not None:
            ctx.setdefault("hook_events", []).append({
                "stage": "security_hook", "event": "l1_block_short_circuits_l2"})
        return l1
    user = prompts.SECURITY_SENTINEL_USER_TEMPLATE.format(redacted_text=redacted_text[:4000])
    res = model_router.call_json(prompts.SECURITY_SENTINEL_SYSTEM, user,
                                 tier="reasoning", lead_id=(ctx or {}).get("lead_id"))
    if "_error" in res:
        # Sentinel failure fails closed for suspicious input, open for clean input.
        verdict = "SUSPICIOUS" if l1.get("level") == "SUSPICIOUS" else l1.get("level", "PASS")
        flags = list(l1.get("flags", [])) + ["sentinel_unavailable_fail_safe"]
    else:
        verdict = res.get("verdict", "SUSPICIOUS")
        flags = sorted(set(l1.get("flags", [])) | set(res.get("flags") or []))
    if ctx is not None:
        ctx.setdefault("hook_events", []).append({
            "stage": "security_hook", "event": "sentinel_verdict",
            "l1": l1.get("level"), "l2": verdict, "flags": flags})
    # Deterministic precedence: BLOCKED > SUSPICIOUS > PASS
    order = {"BLOCKED": 2, "SUSPICIOUS": 1, "PASS": 0}
    final = max([l1.get("level", "PASS"), verdict], key=lambda x: order.get(x, 0))
    return {"level": final, "flags": flags}


# --------------------------------------------------------------------------
# Guarded call — the one door every model call goes through
# --------------------------------------------------------------------------

def guarded_call(agent_key: str, user_template: str, ctx: dict = None,
                 payloads: dict = None, system_prompt: str = None) -> dict:
    reg = registry.get(agent_key)
    system = system_prompt or getattr(prompts, f"{agent_key.upper()}_SYSTEM", "")
    user = render_with_compaction(user_template, payloads or {}, ctx)
    result = model_router.call_json(system, user, tier=reg["model_route"] or "fast",
                                    lead_id=(ctx or {}).get("lead_id"))
    if "_error" in result:
        return result
    return lint_and_repair(agent_key, result, ctx)