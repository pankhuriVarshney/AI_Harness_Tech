# The Michelin Converge Harness — an Engineering Tour

This document walks through every harness component in the system,
mechanism by mechanism: what it is, where it lives, and why it exists.
The design principle throughout: **LLMs propose, code disposes.** Anything
business-critical or security-critical has a deterministic owner that a
model output cannot override.

---

## 1. System Prompts

**Where:** `agents/prompts.py` (single source of truth, `PROMPT_VERSION = "v2.0.0"`)

Every agent prompt follows the same three-part shape:

1. **ROLE + hard rules first** — what the agent must *never* do is stated
   before what it should do. LLMs weight early, imperative constraints more
   reliably than buried formatting instructions.
2. **Inputs + tools** — exactly which data and which tool manifest the
   agent may reason about.
3. **Strict JSON schema** — "JSON only, no prose", with `response_mime_type:
   application/json` as the API-level second layer and a regex extraction
   fallback as the third.

**Versioning as a harness feature:** prompt engineering is code change.
The whole bundle carries one version string that is stamped into every
lead's `state.harness.prompt_version`, so any decision in production is
attributable to a specific prompt set. A/B or rollback = change one file.

Per-prompt rationale: `docs/PROMPTS.md`.

## 2. Tools, Skills, and the MCP-style Contract

**Where:** `agents/tools.py`

A *tool* is a deterministic capability with a contract:

```python
Tool(
    name="catalog.validate_skus",
    description="...",            # shown to the agent AND in the manifest API
    input_schema={...},           # JSON-Schema-ish, validated in code
    output_schema={...},
    handler=<pure python>,        # never an LLM
    allowed_agents=["product_matching", "compliance_critic", "orchestrator"],
)
```

Harness properties:

- **Capability gating (least privilege):** an agent can only invoke tools
  listed in its registry entry; `Tool.invoke()` raises on a wrong caller.
  The negotiation subagent gets *zero* tools — it literally cannot touch
  catalog, policy, or dealers even if its prompt is attacked.
- **MCP-style manifest:** `manifest_for(role)` renders exactly the tools
  (name + description + schemas) that role may use, injected into the
  system prompt — the same contract an external MCP server would expose,
  implemented in-process so the demo needs no servers.
- **Validated invocation:** args are schema-checked before the handler
  runs; a bad call fails in Python, never reaches a model, and is recorded
  in the trace.
- **Schema back-check:** handler outputs are validated too; drift is
  flagged as a `schema_warning` in the trace.

Current toolset (12): `catalog.search`, `catalog.validate_skus`,
`policy.effective_max_discount`, `policy.clamp_discount`, `geo.haversine`,
`dealer.rank`, `lead.compute_score`, `quote.finalize`, `pii.redact`,
`security.scan_input`.

## 3. Bundled Infrastructure

- **Filesystem data plane:** `data/*.json` is the only source of truth for
  catalogue, policy, dealers, leads — and `data/security_policy.json` makes
  the injection/PII rule sets swappable without code changes.
- **In-process sandbox:** tool handlers are pure functions over passed
  data; there is no ambient authority (no DB, no network) reachable from a
  handler. Swapping in real infrastructure later means re-implementing
  handlers, not changing agent logic.
- **No browser/external MCP** is bundled deliberately: nothing in this
  domain needs one, and adding one would only add attack surface. The
  manifest contract keeps the option open.

## 4. Orchestration Logic

**Where:** `agents/orchestrator.py` + `agents/registry.py`

### 4.1 Branching, not pipelines
The orchestrator consults each agent's structured output and *decides what
runs next*: security block → stop; out-of-scope → skip to human; missing
fields → clarification; no-match → one retry then human. There is no fixed
agent sequence anywhere in the code.

### 4.2 Subagent spawning
`deal_optimization` may spawn exactly one child — the **negotiation
subagent** (`agents/negotiation.py`) — which role-plays the customer
against the proposed discount before the offer is finalized. Constraints:

- Registry-gated: only roles listed in `can_spawn` may spawn; `negotiation`
  is marked `subagent: True, max_spawn_depth: 1`, so the child cannot spawn
  grandchildren (no unbounded recursion).
- Context-limited: the subagent receives only the numbers its parent passes
  (price, proposal, budget, policy cap) — no catalog, no dealer data.
- Failure-isolated: if the subagent call fails, the parent proceeds with
  its own proposal (`_subagent_degraded` is recorded, never raised).

The spawn event (parent, child, depth, outcome) appears in `hook_events`
and is therefore demoable in the trace panel.

### 4.3 Handoffs
The compliance critic can return `revise_deal: true`; the orchestrator then
hands the deal back to the deal agent **once** (`max_handoff_loops: 1`,
enforced from the registry, not hardcoded). The revised deal re-enters the
critic. This is a bounded loop with a deterministic exit — a critic can
never stall the pipeline by repeatedly asking for revisions.

### 4.4 Model routing
**Where:** `agents/model_router.py`

| Tier | Used by | Purpose |
|---|---|---|
| `fast` | lead intelligence, scoring, matching, deal, negotiation | cheap, low-latency |
| `reasoning` | compliance critic, security sentinel | stronger judgment where false approval is expensive |

Mechanics:
- **Fallback chain:** primary model errors → try fallback once → structured
  `_error`. Both names come from env (`GEMINI_MODEL_FAST`,
  `GEMINI_MODEL_REASONING`) since model names churn — check
  https://ai.google.dev/gemini-api/docs/models before assuming.
- **Per-lead call budget:** all agents share `HARNESS_CALL_BUDGET` (default
  12) LLM calls per lead. Exhaustion returns `_budget_exceeded`, and every
  agent has a deterministic fallback or escalates. Spend is *bounded by
  construction*, not by hope.
- **Circuit breaker:** 4 consecutive failures opens the breaker for 30 s;
  calls short-circuit to `_circuit_open` instead of hammering a failing
  API. State visible via `GET /api/harness/router-stats`.

## 5. Hooks / Middleware for Deterministic Execution

**Where:** `agents/hooks.py` — every model call in the system goes through
`guarded_call()`; no agent calls the router directly.

### 5.1 Compaction (before_model)
Prompts are rendered with payloads serialized inside them. If the rendered
prompt exceeds `MAX_PROMPT_CHARS`, compaction escalates through levels:
L1 drop null fields + truncate strings >160 chars → L2 cap lists at 12 +
strings >80 → L3 cap lists at 5 + strings >40. A **continuation note** is
appended telling the model the input was compacted, so compaction is
visible to the model, not silent corruption. Every compaction logs its
levels to `hook_events`.

### 5.2 Lint checks + deterministic repair (after_model)
Every model output is validated against the agent's `output_schema` from
the registry. On failure, one **repair pass** runs:

- string→number/boolean coercion
- enum snapping (case-insensitive match; else null)
- range clamping (e.g. confidence forced into [0,1])

Still invalid → the output is replaced with `{"_error", "_lint_errors"}`,
which every agent treats as "model failed" → deterministic fallback or
escalation. **A malformed or non-conforming model answer can never flow
downstream raw.** Lint results (initial errors, repair actions, remaining
errors) are trace-visible.

### 5.3 Security hook (Layer-2 sentinel)
After the Layer-1 scan (see SECURITY.md), untrusted input also goes to the
**security sentinel** LLM (`reasoning` tier). Its verdict follows strict
precedence: BLOCKED > SUSPICIOUS > PASS, and the Layer-1 verdict can only
be escalated, never downgraded. Sentinel failure fails *closed* for
already-suspicious input and open for clean input.

### 5.4 Continuation
Retries (agent-level retry-on-no-match, fallback models, repair passes) are
all structured continuations: the pipeline never restarts from scratch, it
resumes from the last validated state with bounded counters.

## 6. Security Harness

Full treatment in `docs/SECURITY.md`. In one line: **untrusted text is
scanned and redacted before any model sees it; hard findings are code-
enforced and cannot be talked around by any LLM; the API layer is rate
limited and capped.**

## 7. Observability (the demo surface)

- `state.harness` — prompt version, agent count, handoffs, subagent flag
- trace steps — per-agent `hook_events` (compaction, lint, spawns, handoffs)
- `tool_calls` — every tool invocation with args and result
- `GET /api/harness/manifest` — agents, tools, routes, budget
- `GET /api/harness/router-stats` — live router/circuit state
- `state.security` — blocked flag + flags for the lead

The judging question — "does this harness reliably deliver, including edge
cases?" — is answered by showing these, not by asserting it.
