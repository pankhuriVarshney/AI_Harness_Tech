# AI Build Prompt: Tyre Deal Harness

Paste everything below into any AI coding assistant (Claude Code, Cursor,
Gemini CLI, etc.) to build this project from scratch.

---

You are building a **multi-agent harness** (not a chatbot) for a hackathon
called "Harness Engineering Hackathon," domain: Marketing & Sales
(Lead Qualification / Personalization Harness), sponsored by Michelin.

## Product concept
A backend system that takes a customer's freeform, possibly multilingual
message about wanting tyres, and produces: a matched product recommendation
from a real catalog, an indicative deal within strict discount policy limits,
the nearest distributor that stocks it, and a decision on whether the
conversation needs to escalate to a human — all via a chain of narrowly
scoped agents rather than one model doing everything.

The judging question is: "Does this harness reliably deliver — not just in
the demo, but across edge cases and unexpected inputs?" Every design
decision below exists to answer that question.

## Required architecture — six components, each its own module

1. **Intake Agent** — input: raw customer text (any language). Output:
   structured JSON (vehicle type, usage, tyre size, budget, location text,
   detected language, a confidence score, and a list of missing critical
   fields). Constraint: must NOT recommend products, prices, or
   distributors. If confidence is low, it must say so rather than guess —
   guessing here is the primary failure mode to design against.

2. **Catalog Matching Agent** — input: the intake profile + the full product
   catalog (passed as data every call, never memorized). Output: matched SKU
   ids, or if nothing matches exactly, the closest real alternatives plus a
   reason. Hard constraint, enforced in code (not just prompted): it may
   never return a SKU id that isn't literally present in the catalog data it
   was given — filter the model's output against the real catalog ids as a
   backstop.

3. **Deal Agent** — input: matched SKUs (with real prices) + a policy file
   defining `max_discount_pct` and bundle rules. Output: a proposed
   discount and total. Hard constraint, enforced in code: clamp any proposed
   discount to the policy maximum regardless of what the model returns, and
   set an `exceeds_policy` flag if the customer asked for more. Every quote
   must carry a "subject to distributor confirmation" disclaimer — never a
   binding final price.

4. **Locator Agent** — input: customer coordinates + matched SKU ids +
   a distributor list (name, coordinates, phone, stock). Output: nearest
   distributors sorted by (has requested stock, distance). This should be
   **plain deterministic code, not an LLM call** — it's a solved problem
   (haversine distance + a filter) and using a model for it only adds
   latency and a needless failure mode.

5. **Critic / Compliance Agent** — input: the full draft transaction from
   all agents above. Output: approved/not, escalate-to-human boolean, reasons,
   and a customer-safe summary. Constraints: must NOT itself answer
   legal/warranty/safety-recall questions — only detect and flag them for a
   human. Must independently catch (in code, as a backstop, not only via
   the prompt) any discount that exceeds policy, even if the Deal Agent's
   own clamp somehow didn't fire.

6. **Orchestrator** — holds per-session conversation state (accumulated
   profile fields across turns, a counter for repeated no-match attempts),
   calls the agents above in sequence, and decides the graceful-degradation
   path at each failure point:
   - low intake confidence → ask a clarifying question, don't guess
   - no catalog match once → offer alternatives
   - no catalog match twice in a row → escalate to human
   - critic disapproves or flags escalation → return the safe summary, not
     the raw quote
   - any unhandled exception anywhere in the chain → caught at the API layer
     and returned as a normal (non-500) response with `escalate_to_human: true`
     and a generic message, so the frontend never has to special-case a crash

Every agent's output is a JSON object (not freeform text) so agents can be
tested and the orchestrator can branch on fields reliably. Keep a full
per-turn trace (which agents ran, their raw JSON output) so it can be shown
in a "developer/demo mode" panel — this is required for the hackathon demo,
which must show "at least one edge case or error-handling scenario."

## Tech requirements

- Language model: **Gemini API** (`google-generativeai` Python SDK). Use
  JSON-mode / structured output for every agent except the final
  customer-facing reply, which is plain text. Read the API key from an
  environment variable, never hardcode it. Make the model name configurable
  via an environment variable too, since Gemini model names get renamed/
  retired over time — check current names at
  https://ai.google.dev/gemini-api/docs/models before assuming one.
- Backend: a small REST API (Flask is fine) with CORS enabled, exposing at
  minimum: create session, send a chat message, get catalog, get
  distributors. Document the exact request/response JSON shape for each
  endpoint in a separate `UI_CONNECTORS.md` file.
- Frontend: build only a minimal, clearly-labeled **debug/demo shell** (a
  chat box + a raw agent-trace panel), not a polished product UI — the real
  UI will be designed in Figma and wired to the same API later. Mark every
  section of the placeholder HTML with an inline comment like
  `<!-- FIGMA_CONNECTOR: chat-window -->` describing what data it binds to,
  so it's obvious what a future Figma-based frontend replaces and what API
  call it needs to replicate.
- Data: a small JSON catalog (10-15 realistic tyre SKUs with id, model,
  size, usage tags, price), a JSON discount policy file, and a JSON
  distributor list (name, coordinates, phone, stock list). Keep these as
  plain data files, not hardcoded in agent logic, so they're easy to swap
  for real data later.

## Deliverables to produce
1. `agents/` — one file per agent listed above, plus a thin Gemini client
   wrapper shared by all of them.
2. `agents/orchestrator.py` — the harness logic and session state.
3. `app.py` — the Flask API.
4. `data/catalog.json`, `data/policy.json`, `data/distributors.json`.
5. `static/index.html`, `style.css`, `script.js` — the debug shell.
6. `requirements.txt`, `.env.example`.
7. `README.md` — setup steps, the agent table with each one's job and hard
   constraint, and a demo script covering at least these three edge cases:
   over-the-policy discount request, no catalog match, and an out-of-scope
   question (e.g. warranty/legal) that must be escalated rather than answered.
8. `UI_CONNECTORS.md` — the API contract for wiring up a Figma-built
   frontend later, endpoint by endpoint.

## What "done" looks like
Running `python app.py` after setting `GEMINI_API_KEY` serves a working chat
at `localhost:5000` where a normal request produces a bounded quote plus
nearest stocked distributor, and each of the three edge cases above is
visibly caught by a distinct agent's constraint in the trace panel — not
silently handled by "the model just knew better."
