# Michelin Converge — Agentic Lead-to-Dealer Conversion Harness

An agentic AI system that turns a raw customer tyre lead into a validated
sales decision: a lead score, a real product recommendation, a
policy-compliant offer, a dealer assignment, and a next action — or a clean
hand-off to a human when it can't safely decide. Runs on the **Gemini API**
(works with a free/college Gemini API key from Google AI Studio).

This is **not a chatbot**. It's a decision harness: LLM agents reason about
the messy parts, and deterministic Python code enforces every business rule
(catalogue validity, discount ceilings, dealer inventory, restricted
topics) so the model can never talk its way around a policy.

---

## 1. What's in this repo

```text
michelin-converge/
├── agents/
│   ├── gemini_client.py       # Gemini API wrapper (JSON-only calls, retries)
│   ├── prompts.py             # every prompt used, in one place
│   ├── lead_intelligence.py   # Agent 1
│   ├── lead_scoring.py        # Agent 2 (deterministic rubric + LLM narrative)
│   ├── product_matching.py    # Agent 3 (+ deterministic SKU validator/fallback)
│   ├── deal_optimization.py   # Agent 4 (+ deterministic discount clamp)
│   ├── dealer_allocation.py   # Agent 5 (fully deterministic)
│   ├── compliance_critic.py   # Agent 6 (independent review + hard overrides)
│   └── orchestrator.py        # branching control layer + execution trace
├── data/
│   ├── catalog.json           # 12 demo Michelin SKUs
│   ├── policy.json            # discount policy + restricted topics
│   ├── distributors.json      # 4 demo dealers with stock/location/conversion
│   └── leads.json             # 5 demo leads covering the edge cases below
├── static/                    # placeholder dashboard (HTML/CSS/JS)
├── docs/
│   ├── PROMPTS.md             # human-readable explanation of every prompt
│   └── UI_CONNECTORS.md       # API contracts + how to plug in your Figma UI
├── app.py                     # Flask app / REST API
├── requirements.txt
└── .env.example
```

## 2. Setup (5 minutes)

1. **Get a Gemini API key.** If your college subscription gives you access
   to Google AI Studio (https://aistudio.google.com/apikey), generate a key
   there. Any key that works with `google-generativeai` will work here.

2. **Install dependencies**

   ```bash
   cd michelin-converge
   python -m venv venv
   source venv/bin/activate        # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure your key**

   ```bash
   cp .env.example .env
   ```

   Then edit `.env`:

   ```env
   GEMINI_API_KEY=your_real_key_here
   GEMINI_MODEL=gemini-2.0-flash
   ```

   The key is only ever read from the environment — it is never hardcoded
   anywhere in the codebase, and `.env` is meant to stay out of git.

4. **Run it**

   ```bash
   python app.py
   ```

   Open http://localhost:5000 — you'll see the demo dashboard. It talks to
   the same REST API documented in `docs/UI_CONNECTORS.md`, which is what
   you'll point your Figma-based UI at later.

## 3. How a lead flows through the harness

```text
raw lead text
   → Lead Intelligence Agent      (structured profile, confidence, out-of-scope flag)
   → Lead Scoring Agent           (deterministic 0-100 score + LLM-written reasons)
   → Product Matching Agent       (LLM picks a SKU → code validates it's real)
   → Deal Optimization Agent      (LLM proposes a discount → code clamps to policy)
   → Dealer Allocation Agent      (fully deterministic: stock → distance → conversion)
   → Compliance & Sales Critic    (independent LLM review + hard-coded overrides)
   → Orchestrator decision        (CONTACT_NOW / FOLLOW_UP / NURTURE / HUMAN_REVIEW)
```

The **Orchestrator** (`agents/orchestrator.py`) doesn't run agents in a
blind fixed sequence — it branches on what each agent returns:

- Low-confidence or missing lead info → stops immediately, asks for more
  info, never guesses.
- Out-of-scope (warranty/legal/safety) → skips straight to human review;
  no agent tries to answer the substantive question.
- No catalogue match → retries once, then escalates to a human.
- Discount above policy → clamped in code, flagged, and independently
  re-checked by the Compliance Critic.
- Hallucinated SKU → deterministically rejected and replaced with a
  rule-based catalogue match; the trace shows this happened.

Every run produces a full **execution trace** (`GET /api/leads/<id>/trace`)
showing which agents ran, how long each took, and what they returned — so a
demo can prove the result came from the harness, not a single hidden model
call.

## 4. Deterministic guardrails (what code enforces, not the model)

| Rule | Enforced in |
|---|---|
| Recommended SKU must exist in the catalogue | `product_matching.py` |
| Discount can never exceed policy maximum | `deal_optimization.py` |
| Every quote carries the distributor-confirmation disclaimer | `deal_optimization.py` |
| Dealer must actually stock the SKU / exist in the distributor list | `dealer_allocation.py` |
| Warranty/legal/safety/recall topics always escalate | `compliance_critic.py` (keyword pre-check, cannot be overridden by the LLM) |
| A policy violation the code detects cannot be "approved away" by the critic LLM | `compliance_critic.py` |
| No raw exception/model failure ever reaches the frontend | `app.py` (`_error_response`, try/except around orchestrator) |

## 5. Demo script (edge cases included in `data/leads.json`)

| Lead | What it demonstrates |
|---|---|
| `LEAD-104` — Rahul, Hyundai Creta, highway, ₹30k, Pune | Normal path → `CONTACT_NOW` |
| `LEAD-201` — "give me 30% off if I buy all four" | Over-policy discount → clamped + escalated |
| `LEAD-302` — tyre size not in catalogue | No match → retry → human escalation |
| `LEAD-403` — "am I legally entitled to a replacement?" | Out-of-scope warranty/legal → human review, no answer given |
| `LEAD-501` — "need tyres" (nothing else) | Missing info → clarification requested, no guess made |

You can also force a hallucinated-SKU demo by temporarily editing
`agents/product_matching.py` to hardcode a fake SKU string and watching the
deterministic validator reject it and substitute a real one — this is one
of the strongest moments to show in a hackathon demo.

## 6. Where to go next

- `docs/PROMPTS.md` — every prompt, and the reasoning behind its wording.
- `docs/UI_CONNECTORS.md` — full REST API contracts, and step-by-step
  instructions for replacing the placeholder dashboard with your own
  Figma design.
- Swap `SESSIONS` / `LEAD_RESULTS` in `app.py` for a real database
  (Postgres/SQLite) before using this beyond a demo.
- Add authentication before exposing `/api/*` outside your own machine —
  there is none right now.
