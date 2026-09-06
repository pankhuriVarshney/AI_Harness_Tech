# Michelin Converge v2 — Agentic Lead-to-Dealer Conversion Harness

An agentic AI harness that turns a raw, messy (possibly hostile) customer
lead into a validated, policy-compliant sales action — scored, matched,
priced within policy, dealer-allocated, independently reviewed, and, when
anything is off, cleanly escalated to a human.

**v2 is a harness-engineering upgrade, not a feature upgrade.** The business
flow is the same; everything around the LLM calls is now real harness
machinery: a tool/skill registry (MCP-style), model routing with fallback
chains and circuit breakers, a hook pipeline (compaction / lint-repair /
security sentinel), subagent spawning, bounded handoff loops, and a
multi-layer security harness. See `docs/HARNESS.md` for the full tour.

---

## 1. Repo layout

```text
michelin-converge/
├── agents/
│   ├── gemini_client.py     # low-level Gemini transport (JSON extraction)
│   ├── model_router.py      # MODEL ROUTING: tiers, fallback chain, per-lead
│   │                        # call budget, circuit breaker
│   ├── tools.py             # TOOLS/SKILLS REGISTRY (MCP-style, in-process)
│   ├── registry.py          # AGENT REGISTRY: roles, permissions, output
│   │                        # schemas, spawn/handoff rights, model route
│   ├── hooks.py             # HOOK PIPELINE: compaction, lint+repair,
│   │                        # Layer-2 security sentinel
│   ├── security.py          # SECURITY HARNESS Layer 1 (deterministic veto)
│   ├── prompts.py           # versioned system prompts (PROMPT_VERSION)
│   ├── lead_intelligence.py
│   ├── lead_scoring.py
│   ├── product_matching.py
│   ├── deal_optimization.py # spawns negotiation subagent
│   ├── negotiation.py       # SUBAGENT: customer-acceptance simulator
│   ├── dealer_allocation.py # deterministic, tool-backed
│   ├── compliance_critic.py # independent review + hard vetoes + handoffs
│   └── orchestrator.py      # ORCHESTRATION: state, branching, subagents,
│                            # handoffs, graceful degradation
├── data/
│   ├── catalog.json / policy.json / distributors.json / leads.json
│   └── security_policy.json  # data-driven injection/PII rules (swappable)
├── docs/
│   ├── HARNESS.md            # the harness-engineering deep dive
│   ├── SECURITY.md           # threat model + security demo script
│   ├── PROMPTS.md            # prompt rationale (updated for v2)
│   └── UI_CONNECTORS.md
├── static/                   # debug/demo dashboard (unchanged from v1)
├── app.py                    # REST API + middleware (rate limit, headers)
├── requirements.txt
└── .env.example
```

## 2. What's new in v2 (harness technicalities)

| Harness component | Where | What it does |
| --- | --- | --- |
| **System prompts (versioned)** | `agents/prompts.py` | One `PROMPT_VERSION` bundle; every trace records which version produced a decision |
| **Tools / Skills / MCP-style manifest** | `agents/tools.py` | 12 tools with descriptions + JSON schemas + role-based permissions; agents receive a manifest of what they may call; all invocation is validated and traced |
| **Bundled infrastructure** | `data/`, in-process | Filesystem-backed data plane (JSON), sandboxed tool execution (in-process, schema-validated), no external network besides Gemini |
| **Orchestration logic** | `agents/orchestrator.py`, `registry.py` | Branching (not a fixed pipeline), **subagent spawning** (deal → negotiation, depth 1), **handoffs** (compliance → deal revision, max 1 loop), retry counters |
| **Model routing** | `agents/model_router.py` | `fast` vs `reasoning` tiers, env-configurable, **fallback chain**, **per-lead call budget**, **circuit breaker** with cooldown |
| **Hooks / middleware** | `agents/hooks.py` | **Compaction** (3 leveled strategies when prompt exceeds budget), **lint checks** (schema validation of every model output), **deterministic repair** (coercion / enum snapping / clamping), **continuation notes** to the model after compaction |
| **Security harness (MUST)** | `agents/security.py`, `hooks.py`, `app.py` | Layer-1 deterministic scan (injection + restricted topics + obfuscated payloads), PII redaction with reversible tokens, Layer-2 LLM sentinel (can escalate, never un-block), output exfil guard, rate limiting, security headers, request size caps |
| **Observability** | trace + `GET /api/harness/manifest` + `GET /api/harness/router-stats` | Every agent step, tool call, hook event, model used, and security flag is recorded and demoable |

## 3. Setup

```bash
cd michelin-converge
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your GEMINI_API_KEY
python app.py          # http://localhost:5000
```

No new dependencies vs v1 — all harness machinery is stdlib Python.

## 4. Demo leads (incl. 2 new security leads)

| Lead | Demonstrates |
| --- | --- |
| `LEAD-104` Rahul, Creta, highway, ₹30k | Happy path → `CONTACT_NOW` (now with negotiation subagent in trace) |
| `LEAD-201` "30% off if I buy all four" | Over-policy discount → clamped by `policy.clamp_discount` tool + escalation |
| `LEAD-302` size not in catalogue | No match → retry → human escalation |
| `LEAD-403` "legally entitled to replacement?" | Out-of-scope warranty/legal → human review, never answered |
| `LEAD-501` "need tyres" | Missing info → clarification, no guessing |
| **`LEAD-606` prompt-injection attempt** | **Security harness blocks before any model call; `SECURITY_BLOCK` status** |
| **`LEAD-707` lead containing phone + email** | **PII redaction: model sees `<PHONE_1>`, `<EMAIL_1>`; raw PII never leaves the server** |

Force the hallucination demo as in v1: hardcode a fake SKU in
`agents/product_matching.py` and watch `catalog.validate_skus` reject it.

New observability calls for the demo:

- `GET /api/harness/manifest` — agents, tools, routes, prompt version
- `GET /api/harness/router-stats` — call budget usage, circuit breaker state
- `GET /api/leads/<id>/trace` — now also returns `tool_calls` and per-step `hook_events`

## 5. Guardrail ownership (code, not prompts)

| Rule | Enforced by |
| --- | --- |
| SKU must exist in catalogue | `catalog.validate_skus` tool + `catalog.search` backstop |
| Discount ≤ policy max (+bundle bonus) | `policy.clamp_discount` tool — overrides any model number |
| Quote always carries disclaimer, never binding | `quote.finalize` tool |
| Dealer must exist + stock SKU | `dealer.rank` tool on provided data only |
| Warranty/legal/safety/recall → escalate only | `security.scan_input` (L1) + hard veto in `compliance_critic` |
| **Prompt injection cannot reach a model** | `security.scan_input` BLOCKED short-circuits the pipeline pre-model |
| **PII never sent to external model** | `pii.redact` before every untrusted-text model call |
| **Layer-2 LLM cannot un-block Layer-1** | precedence logic in `hooks.security_sentinel_check` |
| Malformed model output never flows downstream | `hooks.lint_and_repair` → `_error` → deterministic fallback |
| LLM spend is bounded per lead | `model_router` call budget + circuit breaker |
| API abuse is bounded | token-bucket rate limit + 256 KB body cap + security headers |

## 6. Documentation

- `docs/HARNESS.md` — every harness component, mechanism by mechanism
- `docs/SECURITY.md` — threat model, layered defenses, security demo script
- `docs/PROMPTS.md` — why each prompt is written the way it is
- `docs/UI_CONNECTORS.md` — API contracts + Figma wiring