# Michelin Converge — Agentic AI Lead-to-Dealer Conversion Harness

## Hackathon Domain
**Marketing & Sales — Lead Qualification, Personalization & Sales Optimization**

## Product Concept

**Michelin Converge** is an **Agentic AI-powered Lead-to-Dealer Conversion Harness** designed to help Michelin sales teams turn raw customer leads into actionable sales opportunities.

Instead of functioning as a chatbot, the system acts as an autonomous **sales decision engine**. It receives customer/lead information, understands the lead, scores purchase intent, recommends a suitable tyre from a real catalogue, optimizes a compliant offer, selects the best distributor, and determines the next sales action.

The system uses multiple narrowly scoped AI agents coordinated by an **Orchestrator Agent**, while deterministic code enforces critical business rules.

### Core Question

> **Can an agentic AI harness reliably decide which leads deserve attention, what should be offered, which dealer should handle the lead, and when a human must take over?**

The system is designed to demonstrate reliability across normal cases, ambiguous inputs, policy violations, unavailable products, and out-of-scope requests.

---

# 1. Why Agentic AI?

This project should not be presented as simply "multiple LLM calls."

It is an **agentic AI system** because agents have:

- clearly defined roles and goals
- access to specific tools/data
- structured outputs
- decision-making responsibilities
- state maintained across the workflow
- the ability to trigger the next step based on results
- validation and guardrails
- human escalation when they cannot safely proceed
- observable execution traces

The **Orchestrator** acts as the control layer that coordinates the agents and determines what happens next.

### Agentic Workflow

```text
                    RAW LEAD
                       │
                       ▼
              ┌─────────────────┐
              │ Lead Intelligence│
              │     Agent       │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Lead Scoring   │
              │     Agent       │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Product Match   │
              │     Agent       │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Deal Optimization│
              │      Agent      │
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
       Dealer Allocation    Compliance
            Agent             Agent
              │                 │
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │ Orchestrator /  │
              │ Sales Decision  │
              └────────┬────────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
        CONTACT NOW         HUMAN REVIEW
```

---

# 2. Product Objective

Michelin Converge should answer four questions for every qualified lead:

1. **How likely is this lead to convert?**
2. **Which Michelin tyre is the best fit?**
3. **What is the best compliant commercial offer?**
4. **Which distributor/sales representative should handle the lead?**

The final output is a **sales action**, not a chatbot response.

Example:

```json
{
  "lead_score": 92,
  "priority": "HIGH",
  "recommended_sku": "MIC-P4-205-55",
  "recommended_discount_pct": 6,
  "recommended_dealer": "Dealer C",
  "recommended_action": "CONTACT_NOW",
  "escalate_to_human": false
}
```

---

# 3. Agent Architecture

## Agent 1 — Lead Intelligence Agent

### Purpose

Converts messy customer/lead information into a structured sales profile.

### Input

Raw lead information such as:

```text
Name: Rahul
Vehicle: Hyundai Creta
Message: "Need new tyres, something good for highway. Around 30k."
Location: Pune
```

### Output

```json
{
  "vehicle": "Hyundai Creta",
  "usage": "highway",
  "budget": 30000,
  "location": "Pune",
  "purchase_intent": "high",
  "urgency": "medium",
  "detected_language": "English",
  "confidence": 0.94,
  "missing_fields": []
}
```

### Agent Responsibilities

- extract vehicle information
- identify tyre requirement
- identify usage
- extract budget
- identify location
- detect language
- estimate purchase intent
- identify urgency
- identify missing information
- assign confidence

### Hard Constraint

The agent **must not recommend tyres, prices, discounts, or dealers**.

If information is unclear, it must return low confidence instead of guessing.

---

# Agent 2 — Lead Scoring Agent

### Purpose

Determines how valuable and actionable the lead is.

The agent combines extracted lead information with deterministic scoring rules.

### Example Scoring Framework

| Factor | Maximum |
|---|---:|
| Purchase urgency | 25 |
| Budget information | 20 |
| Vehicle information | 15 |
| Clear tyre requirement | 20 |
| Location availability | 10 |
| Engagement/intent signals | 10 |
| **Total** | **100** |

### Output

```json
{
  "lead_score": 87,
  "priority": "HIGH",
  "reason": [
    "Clear tyre replacement requirement",
    "Budget provided",
    "Highway usage specified",
    "Local dealer availability"
  ]
}
```

### Hard Constraint

Critical scoring rules should be enforced in deterministic code rather than relying entirely on the LLM.

---

# Agent 3 — Product Recommendation Agent

### Purpose

Selects the best matching Michelin tyre from the real product catalogue.

### Input

- structured lead profile
- lead score
- complete catalogue

### Matching Logic

```text
Vehicle Compatibility
        ↓
Usage Compatibility
        ↓
Tyre Size Compatibility
        ↓
Budget Compatibility
        ↓
Customer Preference
        ↓
Product Availability
```

### Output

```json
{
  "recommended_sku": "MIC-P4-205-55",
  "confidence": 0.91,
  "alternatives": [
    "MIC-E1-205-55",
    "MIC-P2-205-55"
  ],
  "reason": "Best fit for highway-focused usage and stated budget."
}
```

### Hard Constraint

The model may only return SKU IDs that literally exist in the catalogue provided during that request.

A deterministic validator must reject any SKU that is not present.

---

# Agent 4 — Deal Optimization Agent

### Purpose

Determines the most appropriate commercial offer while protecting pricing policy and margin.

The goal is **not simply to give the maximum discount**.

The agent should identify the smallest reasonable incentive that can satisfy the customer's budget and improve conversion potential.

### Example

```text
Product Price:       ₹32,000
Customer Budget:     ₹30,000
Policy Maximum:       8%
Recommended Offer:    6%
```

The system should explain:

> A 6% discount is sufficient to approach the customer's stated budget without unnecessarily using the maximum permitted discount.

### Output

```json
{
  "original_price": 32000,
  "requested_discount_pct": 6,
  "recommended_discount_pct": 6,
  "final_total": 30080,
  "exceeds_policy": false,
  "reason": "Offer remains within policy and closely matches the stated budget.",
  "disclaimer": "Subject to distributor confirmation."
}
```

### Hard Constraints

- Discount cannot exceed policy maximum.
- Discount must be clamped in deterministic code.
- Customer-requested discounts above the policy limit must trigger an `exceeds_policy` flag.
- Every quote must contain a distributor-confirmation disclaimer.
- The system must never present an indicative price as a binding final price.

---

# Agent 5 — Dealer Allocation Agent

### Purpose

Determines the best distributor for the lead.

This should be primarily **deterministic**, because distance and inventory availability are structured problems.

### Inputs

- customer coordinates
- recommended SKU
- distributor list
- inventory
- optional historical sales/conversion data

### Example

```text
Dealer A
Distance: 3.2 km
Stock: Yes
Similar-lead conversion: 71%

Dealer B
Distance: 1.8 km
Stock: No

Dealer C
Distance: 5.1 km
Stock: Yes
Similar-lead conversion: 82%
```

The system can prioritize:

```text
Stock Availability
       ↓
Distance
       ↓
Dealer Performance
       ↓
Lead Capacity
```

### Output

```json
{
  "recommended_dealer": "Dealer C",
  "distance_km": 5.1,
  "stock_available": true,
  "reason": "Requested SKU is in stock and dealer has strong performance with similar leads.",
  "alternatives": ["Dealer A"]
}
```

### Hard Constraint

Dealer selection must be based only on the actual distributor data provided.

The system must never invent a distributor or stock availability.

---

# Agent 6 — Compliance & Sales Critic Agent

### Purpose

Independently reviews the entire transaction before a sales action is generated.

### Inputs

- lead profile
- lead score
- product recommendation
- proposed deal
- dealer allocation
- policy
- detected risk flags

### Output

```json
{
  "approved": true,
  "escalate_to_human": false,
  "reasons": [],
  "customer_safe_summary": "Lead is eligible for sales follow-up with the recommended product and indicative offer."
}
```

### Responsibilities

The critic should detect:

- policy violations
- unsupported product IDs
- missing critical information
- suspicious or contradictory data
- out-of-scope requests
- warranty/legal/safety issues
- unsafe recommendations
- system inconsistencies

### Hard Constraint

The critic must **not answer legal, warranty, safety, or recall questions**.

It can only identify them and escalate to a human.

It must independently verify discount compliance even if the Deal Agent already checked it.

---

# 4. Orchestrator Agent

The Orchestrator is the central agentic control layer.

It maintains:

- per-lead/session state
- accumulated profile fields
- agent outputs
- retry counts
- failure states
- escalation status
- execution trace

### Example State

```json
{
  "lead_id": "LEAD-104",
  "profile": {},
  "lead_score": null,
  "recommendation": null,
  "deal": null,
  "dealer": null,
  "retry_count": 0,
  "escalate_to_human": false,
  "status": "PROCESSING"
}
```

### Agentic Decision Rules

```text
Low confidence
      ↓
Request missing information
      ↓
Do not guess

No product match
      ↓
Attempt alternatives
      ↓
If no match again
      ↓
Human escalation

Policy violation
      ↓
Reject/clamp offer
      ↓
Compliance review

Warranty/legal/safety question
      ↓
Human escalation

Agent failure
      ↓
Retry where appropriate
      ↓
If unrecoverable → Human escalation
```

The Orchestrator should not blindly execute every agent in a fixed sequence. It should **branch based on structured agent outputs**.

That branching behavior is a key part of the Agentic AI implementation.

---

# 5. Deterministic Guardrails

LLMs should not control critical business rules.

The system must include code-level validators for:

### Catalogue Validation

```text
Is SKU present in catalogue?
YES → Continue
NO  → Reject recommendation
```

### Discount Validation

```text
Proposed Discount
        ↓
Compare with Policy Maximum
        ↓
Clamp if necessary
        ↓
Set exceeds_policy flag
```

### Dealer Validation

```text
Does dealer exist?
Does dealer stock the SKU?
Is location valid?
```

### Compliance Validation

```text
Legal / Warranty / Recall
        ↓
Escalate
```

This combination of **agentic reasoning + deterministic controls** is the central engineering principle of the project.

---

# 6. Failure Handling

The system must gracefully degrade instead of crashing.

## Scenario 1 — Low Confidence

```text
Lead Intelligence
       ↓
Confidence = 0.42
       ↓
Missing vehicle/tyre size
       ↓
Orchestrator stops recommendation
       ↓
Request clarification
```

---

## Scenario 2 — No Product Match

```text
Product Agent
      ↓
No exact match
      ↓
Offer real alternatives
```

If there is no match twice:

```text
NO MATCH
   ↓
NO MATCH AGAIN
   ↓
ESCALATE TO HUMAN
```

---

## Scenario 3 — Excessive Discount

Customer asks for:

```text
30% discount
```

Policy allows:

```text
8%
```

System:

```text
30% requested
      ↓
Policy validator
      ↓
30% > 8%
      ↓
Violation detected
      ↓
Maximum allowed = 8%
      ↓
Compliance review
```

---

## Scenario 4 — Out-of-Scope Question

Example:

> "My tyre burst. Am I legally entitled to a replacement?"

System:

```text
Lead Intelligence
        ↓
Out-of-scope detected
        ↓
Compliance Critic
        ↓
Human escalation
```

The AI does **not** invent a legal or warranty answer.

---

## Scenario 5 — Model Hallucination

If the model returns:

```text
MICHELIN-SUPER-TYRE-999
```

but the catalogue does not contain it:

```text
Model Output
     ↓
SKU Validator
     ↓
SKU NOT FOUND
     ↓
Recommendation Rejected
     ↓
Retry / Alternative / Human
```

This demonstrates why the harness exists.

---

# 7. Agent Trace & Observability

Every lead processing run must generate a complete trace.

Example:

```text
LEAD-104

10:42:11  Lead Intelligence       ✓ 182ms
10:42:11  Lead Scoring            ✓ 241ms
10:42:12  Product Matching        ✓ 319ms
10:42:12  Deal Optimization       ✓ 201ms
10:42:12  Dealer Allocation       ✓ 12ms
10:42:12  Compliance Critic       ✓ 164ms

FINAL DECISION
────────────────────────
Lead Score:             92
Priority:               HIGH
Recommended Product:   Primacy 4
Recommended Discount:  6%
Dealer:                Dealer C
Action:                CONTACT_NOW
Escalation:            NO
```

A developer/demo mode should expose:

- agents executed
- execution order
- latency
- raw structured outputs
- validation results
- retries
- failures
- escalation decisions

This is essential to demonstrate that the result came from the **harness**, not from a single hidden model response.

---

# 8. User Interface

The interface should **not be a chatbot**.

Build a minimal **Sales Operations Dashboard**.

## Dashboard

```text
MICHELIN CONVERGE
Agentic Lead-to-Dealer Engine

────────────────────────────────────────────────

TODAY'S PIPELINE

🔥 18 High Priority
🟡 31 Medium Priority
⚪ 24 Low Priority
⚠️ 4 Human Review

────────────────────────────────────────────────

LEAD #104

Rahul Sharma
Hyundai Creta
Highway Usage
Budget: ₹30,000

LEAD SCORE
92 / 100
HIGH PRIORITY

RECOMMENDED TYRE
Michelin Primacy 4
₹32,000

OPTIMIZED OFFER
6% OFF
₹30,080

RECOMMENDED DEALER
Dealer C
5.1 km
In Stock

AI SALES ACTION
🔥 CONTACT NOW

"Lead with highway durability rather than maximum discount."

[ VIEW AGENT TRACE ]
[ SIMULATE OFFER ]
[ ASSIGN TO SALES ]
```

---

# 9. What-If Sales Simulator

Add an optional **What-If Simulator** to demonstrate agentic decision-making.

A sales manager can modify:

- customer budget
- discount
- product
- dealer
- urgency

The system recalculates the expected decision.

Example:

```text
                  CURRENT       SIMULATED

Discount             6%             8%
Revenue            ₹30,080        ₹29,440
Policy               ✓               ✓
Margin             Higher          Lower
Estimated intent    78%             84%

AI RECOMMENDATION

Stay at 6%.

The additional discount may not justify
the estimated conversion improvement.
```

This makes the project an **AI decision-support system**, rather than a recommendation chatbot.

---

# 10. Technology Stack

## Backend

- Python
- Flask
- Flask-CORS
- REST API

## Agentic AI

- Gemini API
- `google-generativeai` Python SDK
- JSON/structured output for agent responses
- Configurable model through environment variables

## Data

```text
data/
├── catalog.json
├── policy.json
├── distributors.json
└── leads.json
```

## Frontend

- HTML
- CSS
- JavaScript
- Minimal debug/demo dashboard

## Configuration

```text
GEMINI_API_KEY=
GEMINI_MODEL=
```

API keys must never be hardcoded.

---

# 11. Project Structure

```text
michelin-converge/
│
├── agents/
│   ├── gemini_client.py
│   ├── lead_intelligence.py
│   ├── lead_scoring.py
│   ├── product_matching.py
│   ├── deal_optimization.py
│   ├── dealer_allocation.py
│   ├── compliance_critic.py
│   └── orchestrator.py
│
├── data/
│   ├── catalog.json
│   ├── policy.json
│   ├── distributors.json
│   └── leads.json
│
├── static/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── app.py
├── requirements.txt
├── .env.example
├── README.md
└── UI_CONNECTORS.md
```

---

# 12. API Endpoints

Minimum API:

```text
POST /api/sessions
```

Creates a lead-processing session.

```text
POST /api/leads/process
```

Processes a lead through the agentic harness.

```text
GET /api/leads
```

Returns available leads.

```text
GET /api/catalog
```

Returns the real tyre catalogue.

```text
GET /api/distributors
```

Returns distributor information.

```text
GET /api/leads/<lead_id>/trace
```

Returns the complete agent execution trace.

```text
POST /api/simulate
```

Runs a What-If sales simulation.

All request/response JSON contracts must be documented in:

```text
UI_CONNECTORS.md
```

---

# 13. Sample Catalogue

Use 10–15 realistic tyre SKUs.

Each product should contain:

```json
{
  "id": "MIC-P4-205-55",
  "model": "Primacy 4",
  "size": "205/55 R16",
  "usage_tags": [
    "highway",
    "city",
    "comfort"
  ],
  "vehicle_types": [
    "sedan",
    "hatchback"
  ],
  "price": 8000
}
```

Use synthetic/demo data unless authorized Michelin product data is available.

---

# 14. Sample Policy

```json
{
  "max_discount_pct": 8,
  "bundle_rules": {
    "four_tyres": {
      "additional_discount_pct": 2
    }
  },
  "quote_disclaimer": "Subject to distributor confirmation."
}
```

---

# 15. Success Criteria

The project is considered complete when:

### Normal Lead

A lead produces:

```text
Lead Score
       +
Product Recommendation
       +
Compliant Offer
       +
Dealer
       +
Sales Action
```

### Edge Cases

The system visibly handles:

1. **Over-policy discount request**
2. **No catalogue match**
3. **Out-of-scope warranty/legal question**
4. **LLM hallucinated SKU**
5. **Missing critical lead information**
6. **Agent/API failure**

### Reliability

The system must:

- never invent catalogue SKUs
- never exceed discount policy
- never invent dealer inventory
- never answer restricted warranty/legal/safety questions
- never expose a raw model failure to the frontend
- escalate when it cannot safely continue
- maintain an execution trace

---

# 16. Hackathon Demo Script

## Demo 1 — Normal Lead

Input:

```text
Rahul has a Hyundai Creta.
He needs tyres mainly for highway driving.
His budget is around ₹30,000.
He is located in Pune.
```

Expected:

```text
Lead Score: HIGH
Product: Suitable Michelin tyre
Offer: Within policy
Dealer: Nearest suitable stocked dealer
Action: CONTACT_NOW
```

Show the agent trace.

---

## Demo 2 — 30% Discount Request

Input:

```text
"I'll buy all four if you give me 30% off."
```

Expected:

```text
Requested: 30%
Maximum Allowed: 8%

⚠ POLICY VIOLATION

Deal is constrained by policy.
Human approval/escalation triggered where required.
```

Show that the model cannot override the code-level rule.

---

## Demo 3 — No Catalogue Match

Input:

```text
"I need a tyre in a size that isn't in your catalogue."
```

Expected:

```text
No exact match.

Real alternatives offered.

Second failure:
→ HUMAN ESCALATION
```

---

## Demo 4 — Warranty Question

Input:

```text
"My tyre burst. Am I legally entitled to a replacement?"
```

Expected:

```text
⚠ OUT OF SCOPE

Category: Warranty / Legal

AI does not answer.

→ HUMAN REVIEW
```

---

## Demo 5 — Hallucinated SKU

Force/mock the Product Agent to return:

```text
MICHELIN-SUPER-TYRE-999
```

Expected:

```text
❌ SKU NOT FOUND

Deterministic validator rejects model output.
```

This is one of the strongest demonstrations of the harness architecture.

---

# 17. Why This Is a Harness, Not a Chatbot

A chatbot primarily optimizes for generating a useful response.

Michelin Converge optimizes for **reliable business decisions**.

```text
CHATBOT

Input
  ↓
LLM
  ↓
Response


MICHELIN CONVERGE

Input
  ↓
Agent
  ↓
Structured State
  ↓
Agent
  ↓
Validation
  ↓
Agent
  ↓
Business Rules
  ↓
Agent
  ↓
Critic
  ↓
Orchestrator
  ↓
Decision
  ↓
Human Escalation if Necessary
```

The system is therefore designed around:

**Autonomy + Specialization + Tools + State + Guardrails + Evaluation + Human Oversight**

rather than simply conversation.

---

# 18. Core Differentiator

### Traditional CRM

> Stores leads.

### Traditional chatbot

> Talks to leads.

### Traditional recommendation system

> Recommends products.

### Michelin Converge

> **Autonomously turns a raw lead into a validated sales action.**

It answers:

> **Who should we contact?**

> **How valuable is the lead?**

> **What should we sell?**

> **What should we offer?**

> **Which dealer should handle it?**

> **Can the AI safely make this decision?**

> **When should a human take over?**

That is the core value proposition of the Agentic AI harness.
