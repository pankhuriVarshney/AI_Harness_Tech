"""
Critic / Compliance Agent
Scope: review the FULL draft transaction (intake + match + deal + locator
output) before it goes to the customer. Catch policy violations and
out-of-scope territory.
Explicitly NOT allowed to: answer legal/warranty/safety-recall questions
itself - it can only flag them for human escalation. This agent has veto
power but no authority to invent answers in the areas it's not scoped for.
"""

import json
from .gemini_client import call_json

SYSTEM_PROMPT = """You are the Critic/Compliance Agent - the last checkpoint
before a response reaches a customer in a tyre-buying harness.

You will receive the full draft transaction as JSON: the customer's original
message, the intake profile, the catalog match, the deal proposal, and the
locator result.

Check for:
1. Did the Deal Agent's discount_pct exceed policy.max_discount_pct? (exceeds_policy flag)
2. Did the customer ask anything about warranty, legal liability, or safety
   recalls? You must NOT answer these yourself - only flag them.
3. Is the catalog match missing (no_exact_match) after this is already a
   repeat attempt?
4. Any claim in the draft that isn't actually supported by the data given to you.

Return strict JSON:
{
  "approved": true|false,
  "escalate_to_human": true|false,
  "escalation_reasons": ["short strings, empty list if none"],
  "customer_safe_summary": "one short paragraph, in the customer's detected_language if given, safe to show as-is"
}

If escalate_to_human is true, customer_safe_summary should tell the customer
what you CAN help with now and that a specific point needs a human, without
guessing at the answer to the escalated question.
"""


def run(draft_transaction: dict) -> dict:
    result = call_json(SYSTEM_PROMPT, json.dumps(draft_transaction))

    # Code-level backstop: never let "approved" be true if the deal exceeded
    # policy - the critic's whole job is to catch this, so double-check in code.
    deal = draft_transaction.get("deal", {})
    if deal.get("exceeds_policy"):
        result["approved"] = False
        result["escalate_to_human"] = True
        if "discount exceeds policy" not in " ".join(result.get("escalation_reasons", [])).lower():
            result.setdefault("escalation_reasons", []).append("Requested discount exceeds policy limit")
    return result
