# UI Connectors (v2)

Same contract philosophy as v1: `app.py` is a plain REST API; `static/` is
a throwaway reference dashboard (v1 files still work — new fields in
responses are additive). CORS is open for local dev; restrict before
shipping.

Base URL: `http://localhost:5000`. All JSON in/out.

## Core endpoints (unchanged)

- `POST /api/sessions` → `{ "session_id": "SESSION-…" }`
- `GET /api/leads` → demo lead inbox (now includes `LEAD-606` injection +
  `LEAD-707` PII leads)
- `GET /api/catalog` → catalogue
- `GET /api/distributors` → dealers
- `POST /api/leads/process` → run the harness; returns `state` (now with
  `state.security`, `state.harness`, and `deal.negotiation` / `deal.subagent_spawned`)
- `GET /api/leads/<lead_id>/trace` → now returns:
  ```json
  {
    "lead_id": "LEAD-104",
    "trace": [
      { "timestamp": "…", "agent": "Lead Intelligence", "duration_ms": 182,
        "ok": true, "note": "", "output": { },
        "hook_events": [ { "stage": "before_agent", "event": "pii_redaction", "tokens": 2 } ] }
    ],
    "tool_calls": [
      { "timestamp": "…", "tool": "policy.clamp_discount", "invoked_by": "deal_optimization",
        "args": { }, "result_ok": true, "result": { } }
    ],
    "final_state": { }
  }
  ```
- `POST /api/simulate` → what-if deal/dealer recompute (unchanged)

Possible `status` values now include `SECURITY_BLOCK` alongside
`PROCESSING`, `NEEDS_CLARIFICATION`, `OUT_OF_SCOPE`, `NO_PRODUCT_MATCH`,
`ESCALATED`, `READY`.

## New observability endpoints (bind these in a "Harness" panel)

- `GET /api/harness/manifest` → agents (roles, tools, spawn rights,
  handoffs), tool descriptions, model routes, prompt version, call budget.
  Ideal for a static "architecture" view in the demo.
- `GET /api/harness/router-stats` → per-lead call counts, consecutive
  failures, circuit-breaker state, resolved routes. Ideal for showing the
  budget/circuit breaker live.

## Error contract

`{"error": "..."}` with a non-200 status. 429 = rate limited. Never a
stack trace.

## Figma wiring

Same two paths as v1 (serve from `static/` or separate frontend with
`VITE_API_BASE`). Element IDs unchanged. Recommended v2 additions:

- Harness panel ← `GET /api/harness/manifest` + `GET /api/harness/router-stats`
- Security badge on lead cards ← `state.security` (blocked + flags)
- Negotiation row in the offer card ← `state.deal.negotiation.rationale`
- Subagent/handoff markers in the trace timeline ← `hook_events` where
  `event` is `subagent_spawn` or `handoff`
- Tool-call feed ← `tool_calls`
