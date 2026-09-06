# Tyre Deal Harness

A multi-agent harness for tyre selection, quoting, and distributor matching —
built for the Harness Engineering Hackathon (Marketing & Sales domain,
Lead Qualification / Personalization Harness).

The chat interface is deliberately thin. The point being demonstrated is the
**harness behind it**: six narrowly-scoped agents, each with a hard
constraint, and a Critic agent that can veto anything before it reaches the
customer.

## Agents

| Agent | File | Job | Cannot do |
|---|---|---|---|
| Intake | `agents/intake_agent.py` | Extract structured facts from freeform, multilingual text | Recommend products or quote prices |
| Catalog Match | `agents/catalog_agent.py` | Match profile to real catalog SKUs | Invent a SKU not in the catalog (code-enforced, not just prompted) |
| Deal | `agents/deal_agent.py` | Propose bundle + discount | Exceed `data/policy.json` max discount (code-enforced) |
| Locator | `agents/locator_agent.py` | Find nearest distributor with stock | Nothing — deterministic, no LLM call at all |
| Critic | `agents/critic_agent.py` | Final review before the customer sees anything | Answer legal/warranty/safety questions itself — only escalate them |
| Orchestrator | `agents/orchestrator.py` | Holds session state, routes agents, decides escalation | — |

## Setup

```bash
cd tyre-deal-harness
pip install -r requirements.txt
cp .env.example .env
# edit .env, add your GEMINI_API_KEY from https://aistudio.google.com/apikey
python app.py
```

Open `http://localhost:5000`.

## Demo script (for the 3–5 min slot)

1. Ask normally: *"Need 4 tyres for my Innova, mostly highway driving, size 235/65R17"* — watch the trace panel: Intake → Catalog Match → Deal → Locator → Critic all fire, and you get a bounded quote + nearest stocked distributor.
2. Edge case 1 — over-discount: *"Can you give me 25% off?"* — Deal Agent caps it at the policy max, Critic flags `exceeds_policy`, response escalates instead of caving.
3. Edge case 2 — no catalog match: ask for a size not in `data/catalog.json` — Catalog Agent returns `exact_match: false` with real alternatives instead of inventing a product.
4. Edge case 3 — out of scope: *"Is this covered under warranty if it bursts?"* — Critic flags it for human escalation instead of the model answering a warranty question it has no authority over.
5. Point at the trace panel and explain: this is why it needed six scoped agents instead of one model doing everything — each of the three edge cases above is caught by a *different* agent's constraint.

## Adding the Figma UI later

The backend is a plain REST API — see **UI_CONNECTORS.md** for the exact
contract every screen binds to. `static/index.html` is a deliberately
undesigned debug shell (see the `FIGMA_CONNECTOR` comments in it) so you can
build/demo the harness today and drop in the real Figma-built frontend later
without touching any agent code.

## Notes

- Gemini model name is set in `.env` (`GEMINI_MODEL`) — Google renames these
  periodically, so if you get a 404 on the model, check
  https://ai.google.dev/gemini-api/docs/models for the current name.
- Sessions are in-memory (`agents/orchestrator.py`, `_SESSIONS` dict) — fine
  for a one-day hackathon, swap for Redis/a DB if this goes further.
- Catalog, policy, and distributor data are toy JSON files in `data/` —
  replace with real Michelin data if you get access to any for the demo.
