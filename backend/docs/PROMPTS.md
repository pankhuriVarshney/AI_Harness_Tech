# Prompt Reference & Design Rationale (v2.0.0)

All prompt strings live in `agents/prompts.py` — one versioned source of
truth (`PROMPT_VERSION`). This document explains *why* each is written the
way it is.

General pattern (unchanged from v1, still load-bearing):
1. **Role + hard rules first** — prohibitions before tasks.
2. **"Output JSON only"** + `response_mime_type: application/json` + regex
   extraction fallback (three layers).
3. **Model output is never authoritative** for anything critical — every
   prompt has a code validator (see README guardrails table).

What's new in v2: security posture blocks, tool manifests, the negotiation
subagent, the security sentinel, and the compliance `revise_deal` handoff.

---

## Agent 1 — Lead Intelligence

**Security posture block (new):** this agent ingests the most hostile input
in the system, so its prompt states explicitly that the text is untrusted,
that override attempts are *data to classify, not commands*, and that the
text arrives pre-scanned and redacted (which is true — Layer-1 + PII
redaction run in `lead_intelligence.run` before `guarded_call`). This is
prompt-layer defense-in-depth; the real guarantees are that the prompt is
never reached on BLOCKED input, and the output schema has no fields that
could carry a price or discount.

**Why extraction-only / no-guess:** a wrong guess here poisons every
downstream agent. `lead_intelligence.py` still recomputes `missing_fields`
itself rather than trusting the model's self-reported uncertainty.

**Why out-of-scope detection stays here:** first-step short-circuit means
no downstream agent ever sees a legal/warranty question it could improvise
an answer to.

## Agent 2 — Lead Scoring

**Why the LLM never produces the number:** scoring decides which leads a
human even looks at; it must be reproducible across model updates. The
rubric is the `lead.compute_score` **tool**; the prompt is told the score
and asked only to phrase 2–4 reasons ("never output a numeric score
yourself").

## Agent 3 — Product Matching

**Tool manifest (new):** the system prompt now embeds a manifest of the
agent's tools with *when to trust them* — "trust their output over your
memory". The backstop is no longer hidden: the prompt tells the agent the
harness will validate its SKUs, which measurably reduces hallucination
attempts (the model learns proposing fake ids is futile).

**Why the catalogue is still inlined every call:** the model needs the
data; inlining makes hallucination *detectable* (validator can diff) rather
than silently plausible.

## Agent 4 — Deal Optimization

**Separation of concerns (unchanged, still the key idea):** the model
optimizes for the *smallest sufficient incentive*; the ceiling is never its
job. Asking one model call to both "maximize the deal" and "obey a hard
cap" produces discounts that hug the cap. `policy.clamp_discount` owns the
number.

**Tool manifest (new):** same contract as Agent 3.

**Negotiation feedback slot (new):** the user template has a
`{negotiation_feedback}` slot so a handoff revision (or the negotiation
subagent's findings) can be injected without prompt surgery.

## Subagent — Negotiation Simulator

**Why it exists:** before a human salesperson offers a discount, the
harness stress-tests it against a simulated customer. Prompting it to stay
in character (customer, not advisor) keeps its `recommended_revision_pct`
grounded in the scenario rather than in generic sales advice. The
subagent's revision is *re-clamped in code* (`negotiation.py` caps it at
the policy ceiling) — even a misbehaving subagent cannot expand policy.

## Agent 5 — Dealer Allocation

No prompt — deliberately. See v1 rationale: ranking stock/distance/
conversion is a solved problem; a model would add latency and
hallucination risk for zero reasoning benefit. It remains an *agent* (role,
inputs, structured output consumed by the orchestrator) with tool-backed
implementation.

## Agent 6 — Compliance & Sales Critic

**Why pre-computed flags:** handing the critic `risk_flags` computed in
code is more reliable than asking it to spot violations in a JSON blob. Its
job is judgment the code can't make — ambiguity, odd combinations — and
phrasing for humans.

**Escalation bias:** stated explicitly with the cost asymmetry (a false
escalation costs minutes; a false approval costs a policy breach).

**`revise_deal` (new):** gives the critic a bounded way to *improve* an
outcome rather than only approve/reject. The orchestrator enforces
`max_handoff_loops: 1` — the prompt does not control the loop.

**Hard veto (code, not prompt):** `compliance_critic.py` forces
`approved=false / escalate=true` on hard flags no matter what the LLM
concluded. The LLM may escalate beyond the code's requirements, never
below.

## Security Sentinel

Deliberately boring: classify intent of pre-scanned, redacted text into
PASS/SUSPICIOUS/BLOCKED with clear criteria and an explicit "you may only
escalate" rule. Its verdict is advisory-in-one-direction-only: precedence
logic in `hooks.security_sentinel_check` makes a downgrade mathematically
impossible.
