"""
Agent Registry — every agent's contract in one auditable table.

Per agent: model route, tools it may invoke (least-privilege), whether it may
spawn subagents (and which), its output schema (used by the lint hook), and
retry policy. The Orchestrator consults this table instead of hardcoding
agent behavior, and GET /api/harness/manifest exposes it for the demo.
"""

PROFILE_SCHEMA = {
    "type": "object",
    "required": ["vehicle_type", "usage", "purchase_intent", "urgency",
                 "is_out_of_scope", "confidence", "missing_fields"],
    "properties": {
        "vehicle": {"type": ["string", "null"]},
        "vehicle_type": {"type": ["string", "null"],
                         "enum": ["hatchback", "sedan", "suv", "sports", "two-wheeler", None]},
        "usage": {"type": ["string", "null"],
                  "enum": ["city", "highway", "offroad", "performance", "commute", "mixed", None]},
        "budget": {"type": ["number", "null"], "minimum": 0},
        "requested_discount_pct": {"type": ["number", "null"], "minimum": 0, "maximum": 100},
        "wants_four_tyres": {"type": "boolean"},
        "location": {"type": ["string", "null"]},
        "purchase_intent": {"type": "string", "enum": ["high", "medium", "low"]},
        "urgency": {"type": "string", "enum": ["high", "medium", "low"]},
        "detected_language": {"type": "string"},
        "is_out_of_scope": {"type": "boolean"},
        "out_of_scope_category": {"type": ["string", "null"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "missing_fields": {"type": "array", "items": {"type": "string"}},
    },
}

SCORING_SCHEMA = {
    "type": "object",
    "required": ["reason"],
    "properties": {"reason": {"type": "array", "items": {"type": "string"}, "maxItems": 6}},
}

MATCH_SCHEMA = {
    "type": "object",
    "required": ["recommended_sku", "confidence", "alternatives", "reason"],
    "properties": {
        "recommended_sku": {"type": ["string", "null"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "alternatives": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        "reason": {"type": "string"},
    },
}

DEAL_SCHEMA = {
    "type": "object",
    "required": ["recommended_discount_pct", "reason"],
    "properties": {
        "recommended_discount_pct": {"type": "number", "minimum": 0, "maximum": 100},
        "reason": {"type": "string"},
    },
}

NEGOTIATION_SCHEMA = {
    "type": "object",
    "required": ["customer_accepts", "counter_discount_pct", "rationale"],
    "properties": {
        "customer_accepts": {"type": "boolean"},
        "counter_discount_pct": {"type": "number", "minimum": 0, "maximum": 100},
        "recommended_revision_pct": {"type": ["number", "null"], "minimum": 0, "maximum": 100},
        "rationale": {"type": "string"},
    },
}

COMPLIANCE_SCHEMA = {
    "type": "object",
    "required": ["approved", "escalate_to_human", "reasons", "customer_safe_summary"],
    "properties": {
        "approved": {"type": "boolean"},
        "escalate_to_human": {"type": "boolean"},
        "revise_deal": {"type": "boolean"},
        "reasons": {"type": "array", "items": {"type": "string"}},
        "customer_safe_summary": {"type": "string"},
    },
}

SENTINEL_SCHEMA = {
    "type": "object",
    "required": ["verdict", "flags"],
    "properties": {
        "verdict": {"type": "string", "enum": ["PASS", "SUSPICIOUS", "BLOCKED"]},
        "flags": {"type": "array", "items": {"type": "string"}},
    },
}

AGENT_REGISTRY = {
    "lead_intelligence": {
        "description": "Extract a structured profile from raw untrusted lead text. Recommends nothing.",
        "model_route": "fast", "tools": ["security.scan_input", "pii.redact"],
        "can_spawn": [], "output_schema": PROFILE_SCHEMA, "max_llm_retries": 0,
    },
    "lead_scoring": {
        "description": "Deterministic rubric owns the score; LLM writes the narrative only.",
        "model_route": "fast", "tools": ["lead.compute_score"],
        "can_spawn": [], "output_schema": SCORING_SCHEMA, "max_llm_retries": 0,
    },
    "product_matching": {
        "description": "Pick a real SKU; hallucinated ids are rejected in code and replaced deterministically.",
        "model_route": "fast", "tools": ["catalog.search", "catalog.validate_skus"],
        "can_spawn": [], "output_schema": MATCH_SCHEMA, "max_llm_retries": 1,
    },
    "deal_optimization": {
        "description": "Smallest sufficient discount; clamped to policy in code; may spawn a negotiation subagent.",
        "model_route": "fast", "tools": ["policy.effective_max_discount", "policy.clamp_discount", "quote.finalize"],
        "can_spawn": ["negotiation"], "output_schema": DEAL_SCHEMA, "max_llm_retries": 0,
    },
    "negotiation": {
        "description": "SUBAGENT — simulates the customer's counter-offer to stress-test a proposed deal. Spawned only by deal_optimization, max depth 1.",
        "model_route": "fast", "tools": [],
        "can_spawn": [], "output_schema": NEGOTIATION_SCHEMA, "max_llm_retries": 0,
        "subagent": True, "parent": "deal_optimization", "max_spawn_depth": 1,
    },
    "dealer_allocation": {
        "description": "Fully deterministic ranking: stock -> distance -> conversion -> capacity. No LLM.",
        "model_route": None, "tools": ["dealer.rank", "geo.haversine"],
        "can_spawn": [], "output_schema": None, "max_llm_retries": 0,
    },
    "compliance_critic": {
        "description": "Independent final review; hard-coded vetoes override its LLM verdict; may request one deal revision (bounded handoff loop).",
        "model_route": "reasoning", "tools": ["catalog.validate_skus", "policy.effective_max_discount", "pii.redact", "security.scan_input"],
        "can_spawn": [], "output_schema": COMPLIANCE_SCHEMA, "max_llm_retries": 0,
        "handoffs": {"revise_deal": "deal_optimization"}, "max_handoff_loops": 1,
    },
    "security_sentinel": {
        "description": "Layer-2 LLM security check. Can only escalate, never un-block a Layer-1 finding.",
        "model_route": "reasoning", "tools": [],
        "can_spawn": [], "output_schema": SENTINEL_SCHEMA, "max_llm_retries": 0,
    },
}


def get(agent_key: str) -> dict:
    return AGENT_REGISTRY[agent_key]


def manifest() -> list:
    out = []
    for key, a in AGENT_REGISTRY.items():
        out.append({
            "key": key,
            "description": a["description"],
            "model_route": a["model_route"],
            "tools": a["tools"],
            "can_spawn": a["can_spawn"],
            "subagent": a.get("subagent", False),
            "handoffs": a.get("handoffs", {}),
        })
    return out