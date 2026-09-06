"""
Thin wrapper around the Gemini API so every agent calls the model the same way
and JSON-mode / error handling lives in one place.

Requires: pip install google-generativeai
Set GEMINI_API_KEY in your environment (see .env.example).

Model name is read from GEMINI_MODEL so you can bump it without touching code.
Google rotates Gemini model names fairly often - check
https://ai.google.dev/gemini-api/docs/models for the current list before the
hackathon. gemini-2.5-flash-lite / gemini-2.5-flash / gemini-3.1-flash-lite
were all valid low-cost, low-latency choices as of Sept 2026, which is what
you want across 4-5 chained agent calls per turn.
"""

import os
import json
import google.generativeai as genai

DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

_configured = False


def _ensure_configured():
    global _configured
    if _configured:
        return
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Copy .env.example to .env, add your "
            "key from https://aistudio.google.com/apikey, and load it "
            "before starting the server."
        )
    genai.configure(api_key=api_key)
    _configured = True


def call_json(system_prompt: str, user_prompt: str, model: str = None) -> dict:
    """
    Calls Gemini and forces a JSON object back, so every agent's contract with
    the orchestrator is a predictable dict instead of freeform text.
    Raises ValueError if the model returns something that isn't valid JSON -
    the caller (an agent) is responsible for deciding what "fail safely" means
    for its own step.
    """
    _ensure_configured()
    model_obj = genai.GenerativeModel(
        model_name=model or DEFAULT_MODEL,
        system_instruction=system_prompt,
        generation_config={"response_mime_type": "application/json"},
    )
    response = model_obj.generate_content(user_prompt)
    text = (response.text or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Model did not return valid JSON: {text[:300]}") from e


def call_text(system_prompt: str, user_prompt: str, model: str = None) -> str:
    """Plain text call - used only for the final customer-facing reply."""
    _ensure_configured()
    model_obj = genai.GenerativeModel(
        model_name=model or DEFAULT_MODEL,
        system_instruction=system_prompt,
    )
    response = model_obj.generate_content(user_prompt)
    return (response.text or "").strip()
