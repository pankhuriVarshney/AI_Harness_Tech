"""
Tool & Skill Registry — MCP-style, in-process.

Every capability an agent may use is declared here as a Tool with:
  - name + description  -> injected into the agent's prompt as its available
    "skills", exactly like an MCP server's tool manifest would be
  - input_schema / output_schema -> JSON-Schema-ish dicts, validated in code
  - handler             -> the deterministic Python implementation
  - allowed_agents      -> capability gating: only listed roles may invoke

Agents never touch handlers directly. They call `invoke_tool()`, which:
  1. checks the caller's role is allowed (least-privilege)
  2. validates arguments against input_schema (bad args -> ToolError, no LLM)
  3. runs the handler and records the call in the execution trace

Because everything is in-process, the demo needs zero external MCP servers,
but the contract (manifest + schemas + validation) is identical to one.
"""

from agents import security


class ToolError(Exception):
    pass


# --------------------------------------------------------------------------
# Minimal JSON-Schema-subset validator (shared by tools + output lint)
# --------------------------------------------------------------------------

_TYPE_MAP = {
    "object": dict, "array": list, "string": str,
    "number": (int, float), "integer": int, "boolean": bool, "null": type(None),
}


def validate_against_schema(value, schema, path="$", errors=None):
    """Validate `value` against a JSON-Schema-ish dict. Returns list of
    error strings (empty == valid). Supported keys: type, enum, required,
    properties, items, minimum, maximum, minItems, maxItems."""
    if errors is None:
        errors = []

    expected = schema.get("type")
    if expected:
        types = expected if isinstance(expected, list) else [expected]
        pytypes = tuple(t for t in (_TYPE_MAP.get(t) for t in types) if t)
        if pytypes and not isinstance(value, pytypes):
            errors.append(f"{path}: expected {expected}, got {type(value).__name__}")
            return errors

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: {value!r} not in enum {schema['enum']}")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: {value} < minimum {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: {value} > maximum {schema['maximum']}")

    if isinstance(value, dict):
        for req in schema.get("required", []):
            if req not in value or value[req] is None and schema.get("nullable", {}).get(req) is False:
                errors.append(f"{path}.{req}: missing required field")
        props = schema.get("properties", {})
        for k, sub in props.items():
            if k in value and value[k] is not None:
                validate_against_schema(value[k], sub, f"{path}.{k}", errors)

    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: needs >= {schema['minItems']} items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: needs <= {schema['maxItems']} items")
        if "items" in schema:
            for i, item in enumerate(value):
                validate_against_schema(item, schema["items"], f"{path}[{i}]", errors)

    return errors


# --------------------------------------------------------------------------
# Deterministic tool handlers
# --------------------------------------------------------------------------

def _catalog_search(profile: dict, catalog: list) -> list:
    """Rank catalogue candidates by vehicle type -> usage -> budget fit."""
    vehicle_type, usage, budget = profile.get("vehicle_type"), profile.get("usage"), profile.get("budget")
    candidates = list(catalog)
    if vehicle_type:
        f = [c for c in candidates if vehicle_type in c.get("vehicle_types", [])]
        candidates = f or candidates
    if usage:
        f = [c for c in candidates if usage in c.get("usage_tags", [])]
        candidates = f or candidates
    if budget:
        f = [c for c in candidates if c["price"] <= budget * 1.15]
        candidates = f or candidates
    return sorted(candidates, key=lambda c: abs(c["price"] - (budget or c["price"])))


def _catalog_validate_skus(skus: list, catalog: list) -> dict:
    real = {c["id"] for c in catalog}
    skus = [s for s in skus if s]
    return {
        "valid": [s for s in skus if s in real],
        "rejected": [s for s in skus if s not in real],
        "hallucinated": [s for s in skus if s not in real],
    }


def _policy_effective_max(policy: dict, wants_four: bool) -> int:
    bonus = policy.get("bundle_rules", {}).get("four_tyres", {}).get("additional_discount_pct", 0) if wants_four else 0
    return policy["max_discount_pct"] + bonus


def _policy_clamp_discount(proposed_pct, requested_pct, policy: dict, wants_four: bool) -> dict:
    cap = _policy_effective_max(policy, wants_four)
    proposed = proposed_pct if isinstance(proposed_pct, (int, float)) else 0
    clamped = max(0, min(round(proposed), cap))
    return {
        "clamped_discount_pct": clamped,
        "policy_cap_pct": cap,
        "exceeds_policy": bool(requested_pct and requested_pct > cap),
        "was_clamped": clamped != proposed,
    }


def _geo_haversine(lat1, lng1, lat2, lng2) -> float:
    import math
    if None in (lat1, lng1, lat2, lng2):
        return None
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(r * 2 * math.asin(math.sqrt(a)), 1)


def _dealer_rank(sku, customer_lat, customer_lng, distributors: list) -> list:
    ranked = []
    for d in distributors:
        ranked.append({
            "id": d["id"], "name": d["name"],
            "stock": sku in d.get("stock", []) if sku else False,
            "distance_km": _geo_haversine(customer_lat, customer_lng, d.get("lat"), d.get("lng")),
            "conversion": d.get("conversion_rate", {}).get("default", 0.0),
            "capacity": d.get("capacity_leads_per_day", 0),
        })
    ranked.sort(key=lambda d: (
        not d["stock"],
        d["distance_km"] if d["distance_km"] is not None else 9999,
        -d["conversion"], -d["capacity"],
    ))
    return ranked


def _lead_compute_score(profile: dict) -> dict:
    MAX = {"urgency": 25, "budget": 20, "vehicle": 15, "tyre_requirement": 20, "location": 10, "intent": 10}
    b = {}
    b["urgency"] = {"high": 25, "medium": 15, "low": 5}.get(profile.get("urgency"), 0)
    b["budget"] = MAX["budget"] if profile.get("budget") else 0
    b["vehicle"] = MAX["vehicle"] if profile.get("vehicle") or profile.get("vehicle_type") else 0
    b["tyre_requirement"] = MAX["tyre_requirement"] if profile.get("usage") else 0
    b["location"] = MAX["location"] if profile.get("location") else 0
    b["intent"] = {"high": 10, "medium": 6, "low": 2}.get(profile.get("purchase_intent"), 0)
    total = sum(b.values())
    priority = "HIGH" if total >= 75 else "MEDIUM" if total >= 45 else "LOW"
    return {"lead_score": total, "priority": priority, "breakdown": b, "max_points": MAX}


def _quote_finalize(price: float, discount_pct: int, policy: dict, wants_four: bool) -> dict:
    return {
        "original_price": price,
        "final_total": round(price * (1 - discount_pct / 100)),
        "disclaimer": policy.get("quote_disclaimer", "Subject to distributor confirmation."),
    }


def _pii_redact(text: str) -> dict:
    return security.redact_pii(text)


def _security_scan(text: str) -> dict:
    return security.scan_input(text)


# --------------------------------------------------------------------------
# Tool definitions
# --------------------------------------------------------------------------

class Tool:
    def __init__(self, name, description, input_schema, output_schema, handler, allowed_agents):
        self.name = name
        self.description = description
        self.input_schema = input_schema
        self.output_schema = output_schema
        self.handler = handler
        self.allowed_agents = allowed_agents

    def invoke(self, agent_role: str, args: dict, trace=None) -> dict:
        if agent_role not in self.allowed_agents:
            raise ToolError(f"role '{agent_role}' is not permitted to use tool '{self.name}'")
        errors = validate_against_schema(args, self.input_schema)
        if errors:
            raise ToolError(f"invalid args for '{self.name}': {'; '.join(errors)}")
        result = self.handler(**args)
        out_errors = validate_against_schema(result, self.output_schema)
        if trace is not None:
            trace.record_tool_call(self.name, agent_role, args, result, ok=not out_errors)
        return {"result": result, "schema_warnings": out_errors}


TOOLS = {
    "catalog.search": Tool(
        "catalog.search",
        "Deterministically rank catalogue SKUs against a lead profile "
        "(vehicle type -> usage tag -> budget fit). Use as ground truth when "
        "unsure; it only ever returns SKUs that literally exist in the catalogue.",
        {"type": "object", "required": ["profile", "catalog"],
         "properties": {"profile": {"type": "object"}, "catalog": {"type": "array"}}},
        {"type": "array", "items": {"type": "object"}},
        _catalog_search,
        ["product_matching", "orchestrator"],
    ),
    "catalog.validate_skus": Tool(
        "catalog.validate_skus",
        "Split a list of SKU ids into valid/rejected against the real catalogue. "
        "Always run this on any model-proposed SKU before trusting it.",
        {"type": "object", "required": ["skus", "catalog"],
         "properties": {"skus": {"type": "array", "items": {"type": "string"}},
                        "catalog": {"type": "array"}}},
        {"type": "object", "required": ["valid", "rejected", "hallucinated"]},
        _catalog_validate_skus,
        ["product_matching", "compliance_critic", "orchestrator"],
    ),
    "policy.effective_max_discount": Tool(
        "policy.effective_max_discount",
        "Return the effective discount ceiling for this transaction, including "
        "any bundle bonus. The LLM never computes this itself.",
        {"type": "object", "required": ["policy", "wants_four"],
         "properties": {"policy": {"type": "object"}, "wants_four": {"type": "boolean"}}},
        {"type": "object", "required": ["max_pct"]},
        lambda policy, wants_four: {"max_pct": _policy_effective_max(policy, wants_four)},
        ["deal_optimization", "compliance_critic", "orchestrator"],
    ),
    "policy.clamp_discount": Tool(
        "policy.clamp_discount",
        "Clamp a proposed discount pct to policy, flag if the customer's "
        "requested pct exceeds policy. Deterministic; overrides any model output.",
        {"type": "object", "required": ["proposed_pct", "policy"],
         "properties": {"proposed_pct": {"type": "number"},
                        "requested_pct": {"type": ["number", "null"]},
                        "policy": {"type": "object"}, "wants_four": {"type": "boolean"}}},
        {"type": "object", "required": ["clamped_discount_pct", "policy_cap_pct", "exceeds_policy", "was_clamped"]},
        _policy_clamp_discount,
        ["deal_optimization", "orchestrator"],
    ),
    "geo.haversine": Tool(
        "geo.haversine",
        "Great-circle distance in km between two lat/lng points. Pure math.",
        {"type": "object", "required": ["lat1", "lng1", "lat2", "lng2"]},
        {"type": ["number", "null"]},
        lambda lat1, lng1, lat2, lng2: _geo_haversine(lat1, lng1, lat2, lng2),
        ["dealer_allocation", "orchestrator"],
    ),
    "dealer.rank": Tool(
        "dealer.rank",
        "Rank distributors by (stocks SKU, distance, conversion, capacity). "
        "Never invents dealers or stock; works only on the provided list.",
        {"type": "object", "required": ["sku", "distributors"],
         "properties": {"sku": {"type": ["string", "null"]},
                        "customer_lat": {"type": ["number", "null"]},
                        "customer_lng": {"type": ["number", "null"]},
                        "distributors": {"type": "array"}}},
        {"type": "array", "items": {"type": "object"}},
        _dealer_rank,
        ["dealer_allocation", "orchestrator"],
    ),
    "lead.compute_score": Tool(
        "lead.compute_score",
        "Authoritative deterministic lead-scoring rubric (0-100). The LLM only "
        "ever writes the narrative; this tool owns the number.",
        {"type": "object", "required": ["profile"], "properties": {"profile": {"type": "object"}}},
        {"type": "object", "required": ["lead_score", "priority", "breakdown"]},
        _lead_compute_score,
        ["lead_scoring", "orchestrator"],
    ),
    "quote.finalize": Tool(
        "quote.finalize",
        "Compute final totals and attach the mandatory disclaimer from policy. "
        "Never emits a binding price.",
        {"type": "object", "required": ["price", "discount_pct", "policy"],
         "properties": {"price": {"type": "number"}, "discount_pct": {"type": "integer"},
                        "policy": {"type": "object"}, "wants_four": {"type": "boolean"}}},
        {"type": "object", "required": ["original_price", "final_total", "disclaimer"]},
        _quote_finalize,
        ["deal_optimization", "orchestrator"],
    ),
    "pii.redact": Tool(
        "pii.redact",
        "Replace emails/phone numbers/API-key-shaped strings with reversible "
        "tokens before any text is sent to an external model.",
        {"type": "object", "required": ["text"], "properties": {"text": {"type": "string"}}},
        {"type": "object", "required": ["redacted_text", "mapping", "count"]},
        _pii_redact,
        ["lead_intelligence", "compliance_critic", "orchestrator"],
    ),
    "security.scan_input": Tool(
        "security.scan_input",
        "Deterministic prompt-injection / restricted-topic scan. Returns "
        "level PASS|SUSPICIOUS|BLOCKED. A BLOCKED verdict can never be "
        "overridden by any LLM downstream.",
        {"type": "object", "required": ["text"], "properties": {"text": {"type": "string"}}},
        {"type": "object", "required": ["level", "flags"]},
        _security_scan,
        ["lead_intelligence", "compliance_critic", "orchestrator"],
    ),
}


def manifest_for(agent_role: str) -> list:
    """MCP-style tool manifest: only what this role may call, descriptions +
    schemas, for injection into its system prompt."""
    out = []
    for t in TOOLS.values():
        if agent_role in t.allowed_agents:
            out.append({"name": t.name, "description": t.description,
                        "input_schema": t.input_schema, "output_schema": t.output_schema})
    return out


def invoke_tool(name: str, agent_role: str, args: dict, trace=None) -> dict:
    tool = TOOLS.get(name)
    if not tool:
        raise ToolError(f"unknown tool '{name}'")
    return tool.invoke(agent_role, args, trace=trace)