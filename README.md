# Agentic AI Harness

An agentic AI harness that turns a raw, messy (possibly hostile) customer
lead into a validated, policy-compliant sales action — scored, matched,
priced within policy, dealer-allocated, independently reviewed, and, when
anything is off, cleanly escalated to a human.

## 1. What This Is

This project is an **agentic AI harness** — not a chatbot — that turns a raw, messy customer lead into a validated, policy-compliant sales action. It receives lead information, scores purchase intent, recommends a real tyre from the catalogue, optimizes a compliant discount, selects the best distributor, and decides whether a human sales rep should be looped in.

Multiple narrowly scoped AI agents do the reasoning. Deterministic code enforces the business rules the agents are never allowed to override. An Orchestrator agent coordinates the whole thing and branches based on what each agent actually returns — it does not run agents in a blind fixed sequence.

**Core question the project answers:**
> Can an agentic AI harness reliably decide which leads deserve attention, what should be offered, which dealer should handle it, and when a human must take over — while never breaking policy, inventing data, or answering questions it isn't allowed to answer?

---

## 2. Why "Harness," Not "Chatbot"

This distinction is the spine of the project, so it's worth stating plainly.

| System | What it does |
|---|---|
| **CRM** | Stores leads. Makes no decisions. |
| **Chatbot** | Talks to leads. Each reply is a fresh, memoryless generation — no persistent state, no validation. |
| **Recommendation engine** | Recommends one thing (a product), in isolation, with no pricing, allocation, or compliance logic attached. |
| **Michelin Converge** | Chains multiple bounded decisions together, validates each one against real business rules, maintains state across the whole flow, and knows when to stop and escalate to a human. |

A chatbot optimizes for *a plausible-sounding response*. Michelin Converge optimizes for *a reliable business decision*. That distinction pre-empts the most obvious critique a reviewer will have — "why not just build something simpler?" — by showing exactly what "simpler" gives up: guardrails against hallucinated SKUs, policy-breaking discounts, and answering questions (legal/warranty) the system has no business answering.

```
CHATBOT                          MICHELIN CONVERGE

Input                            Input
  ↓                                ↓
LLM                              Agent → Structured State
  ↓                                ↓
Response                        Agent → Validation
                                   ↓
                                 Agent → Business Rules
                                   ↓
                                 Agent → Critic
                                   ↓
                                 Orchestrator → Decision
                                   ↓
                                 Human Escalation if Necessary
```

---

## 3. End-to-End Flow (User's Side)

The end user is a **Sales team member**, working from a dashboard — not the customer, and not a chat window.

1. **A lead arrives.** Raw, unstructured info lands in the queue (e.g. "Rahul, Hyundai Creta, wants highway tyres, budget ~₹30k, Pune"). The user does nothing yet.
2. **The harness processes it in the background.** The agent chain runs: extract → score → match product → optimize offer → allocate dealer → compliance check. The user doesn't watch this happen live; they see the finished result land on the dashboard, with an option to inspect the full trace.
3. **User opens the Sales Ops Dashboard.** A pipeline overview shows how many leads are High / Medium / Low priority, and how many are sitting in Human Review.
4. **User opens a specific lead.** Everything is pre-decided: lead score, recommended tyre, recommended discount (already policy-checked), recommended dealer (with stock/distance), and a one-line action — e.g. `CONTACT NOW`.
5. **User acts.** Three buttons: **View Agent Trace** (see how the decision was reached), **Simulate Offer** (see below), **Assign to Sales**.
6. **Edge cases surface as flags, not crashes.** Ambiguous leads, over-policy discount requests, out-of-catalogue asks, and legal/warranty questions land in Human Review with a stated reason — never a fabricated answer.
7. **Optional what-if exploration** before finalizing (see Section 4).

The net effect: the rep's job shifts from *"figure out what to offer this lead"* to *"review, trust or override, and click assign"* — with full visibility into why the system decided what it did.

---

---

## 1. Repo layout

```text
app/
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
cd app
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
