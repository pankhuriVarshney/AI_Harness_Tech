"""
Thin wrapper around the Gemini API (google-generativeai SDK).

Design goals:
- One place that knows how to talk to Gemini, so every agent calls the same
  well-tested function instead of re-implementing JSON parsing/retries.
- Never crash the app on a bad/empty model response - always return a
  Python dict (possibly an {"_error": ...} dict) so agents can degrade
  gracefully per the harness's "never expose a raw model failure to the
  frontend" requirement.
- API key is read only from the environment. It is never hardcoded and
  never logged.
"""

import os
import json
import re
import time

_MODEL_CACHE = {}


def _get_model(system_instruction: str):
    """Lazily configure and cache a genai model instance per system prompt."""
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to your .env file (see .env.example)."
        )

    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    cache_key = (model_name, system_instruction)
    if cache_key not in _MODEL_CACHE:
        genai.configure(api_key=api_key)
        _MODEL_CACHE[cache_key] = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction,
            generation_config={
                "temperature": 0.2,
                "response_mime_type": "application/json",
            },
        )
    return _MODEL_CACHE[cache_key]


def _extract_json(text: str):
    """Best-effort extraction of a JSON object from a model response, in
    case response_mime_type=json isn't honored (e.g. older SDK/model)."""
    text = text.strip()
    text = re.sub(r"^```(json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    raise ValueError(f"Could not parse JSON from model output: {text[:300]}")


def call_gemini_json(system_prompt: str, user_prompt: str, max_retries: int = 2) -> dict:
    """Call Gemini with a system+user prompt pair, expecting a JSON object
    back. Retries on transient errors / malformed JSON. Returns a dict with
    key "_error" set if every attempt fails, so the caller can decide how to
    degrade (retry with a rule-based fallback, escalate, etc.)."""

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            model = _get_model(system_prompt)
            response = model.generate_content(user_prompt)
            text = response.text
            return _extract_json(text)
        except Exception as exc:  # noqa: BLE001 - we deliberately catch everything
            last_error = str(exc)
            if attempt < max_retries:
                time.sleep(0.6 * (attempt + 1))
                continue

    return {"_error": last_error or "Unknown Gemini error"}
