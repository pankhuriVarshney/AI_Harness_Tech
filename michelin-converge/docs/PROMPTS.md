# Prompt Reference & Design Rationale

The actual prompt strings live in `agents/prompts.py` so there is exactly
one source of truth. This document explains **why** each one is written the
way it is, for anyone reviewing or presenting the project.

General pattern used in every prompt:

1. **Role + hard rules first.** Every system prompt opens by telling the
   agent what it is *not* allowed to do, before telling it what to do. This
   is deliberate — LLMs weight instructions that appear early and are
   phrased as hard constraints more reliably than instructions buried in
   formatting requirements.
2. **"Output JSON only."** Every prompt ends with a strict schema and an
   instruction to return nothing else. `gemini_client.py` also sets
   `response_mime_type: "application/json"` at the API level as a second
   layer, and falls back to regex-extracting a JSON object if the model
   still wraps it in prose or markdown fences.
3. **Never treat the model's own output as authoritative for anything
   safety/business-critical.** Every prompt below has a matching Python
   validator that re-checks its output (see the README's guardrails table).

---

## Agent 1 — Lead Intelligence (`LEAD_INTELLIGENCE_SYSTEM`)

**Why it's restricted to extraction only:** this is the one agent that
touches completely unstructured, untrusted customer text. If it were also
allowed to recommend a product or price, a customer's phrasing could
indirectly steer a sales outcome before any policy checks exist. Keeping it
extraction-only means everything risky happens downstream, behind
validators.

**Why "must not guess":** a wrong guess here (e.g. inventing a vehicle type)
poisons every agent after it. The prompt explicitly rewards returning
`null` + `missing_fields` over fabricating a plausible-sounding value, and
`lead_intelligence.py` recomputes `missing_fields` itself rather than
trusting the model's list, since an LLM under-reporting its own uncertainty
is a common failure mode.

**Why out-of-scope detection lives here, not later:** catching "is this
actually a legal/warranty complaint?" at the very first step lets the
Orchestrator short-circuit the entire pipeline immediately, so no
downstream agent ever gets a chance to improvise a legal answer.

## Agent 2 — Lead Scoring (`LEAD_SCORING_SYSTEM`)

**Why the LLM never produces the number:** lead scoring drives priority and
which leads a human even looks at — it needs to be reproducible and
explainable in a spreadsheet, not something that can silently drift with
model updates. `lead_scoring.py` computes the 0–100 score from a fixed
rubric in plain Python; the prompt is only asked to phrase 2–4 bullet
reasons from the already-computed breakdown, and is explicitly told "never
output a numeric score yourself."

## Agent 3 — Product Matching (`PRODUCT_MATCHING_SYSTEM`)

**Why the full catalogue is inlined into the prompt every time:** the model
has no other source of truth for what SKUs exist. This is intentional —
it makes hallucination detectable and correctable rather than silently
plausible. The prompt states the constraint twice (system prompt + the
schema's "or null" for `recommended_sku`) because SKU hallucination is the
single most damaging possible failure in this system (see Demo 5 in the
original spec).

**Backstop:** `product_matching.py` checks every returned SKU against the
literal catalogue passed to that call. Any hallucinated or missing SKU is
discarded and replaced by a deterministic filter-and-rank matcher
(`_rule_based_match`), so the pipeline never halts just because the model
had an off run.

## Agent 4 — Deal Optimization (`DEAL_OPTIMIZATION_SYSTEM`)

**Why it's told not to worry about the policy ceiling:** asking a model to
both "propose the best discount" and "obey a hard numeric ceiling" in the
same breath tends to produce discounts that hug the ceiling instead of the
customer's actual budget. Separating concerns — model optimizes for
minimal sufficient incentive, code clamps to policy — produces both a
better-reasoned discount and a guaranteed-safe one.

**Deterministic clamp:** `deal_optimization.py` always takes
`min(proposed, policy_max [+ bundle bonus])`, always recomputes
`final_total` itself from price and the clamped percentage, and always
attaches the disclaimer string from `policy.json` rather than trusting the
model to remember to add one.

## Agent 5 — Dealer Allocation (no LLM prompt)

Deliberately has no Gemini call at all. Distance, stock, and conversion
rate are structured numeric/lookup problems — asking an LLM to rank them
adds latency and hallucination risk with no reasoning benefit. This is the
clearest example in the system of "use agentic *architecture*, not agentic
*everything*" — it's still an agent (it has a role, inputs, and a
structured output the Orchestrator consumes), it just doesn't need
generative reasoning to do its job well.

## Agent 6 — Compliance & Sales Critic (`COMPLIANCE_CRITIC_SYSTEM`)

**Why it gets pre-computed risk flags instead of raw state only:** asking
an LLM to notice a policy violation buried in a JSON blob is less reliable
than asking Python to compute `exceeds_policy` deterministically and simply
handing the critic a short list of flags to reason about and phrase for a
human. The critic's real job is judgment calls the code can't make
(ambiguous or contradictory data, an odd combination of factors) — not
arithmetic it's already been given the answer to.

**Why escalation bias is explicit ("prefer escalate_to_human = true"):** in
a sales context, an unnecessary human review costs a few minutes; an
incorrect auto-approval can mean a broken promise to a customer or a policy
breach reaching a dealer. The prompt states this asymmetry directly so the
model doesn't optimize for "sounding confident."

**Hard override in code:** regardless of what the critic LLM concludes,
`compliance_critic.py` forces `approved = false` and
`escalate_to_human = true` whenever a hard deterministic flag exists
(out-of-scope topic, restricted keyword, or policy violation). The LLM can
escalate *more* than the code requires, never less.
