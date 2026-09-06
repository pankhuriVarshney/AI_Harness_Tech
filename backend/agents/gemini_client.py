"""
Low-level Gemini transport. Deliberately knows NOTHING about routing,
budgets, or schemas — that lives in model_router.py and hooks.py. This
module only: configure SDK from env, generate text, extract JSON.
"""

import os
import json
import re

_MODEL_CACHE = {}


def generate_text(model_name: str, system_instruction: str, user_prompt: str) -> str:
    """Generate one completion. Raises on any failure — callers route/retry."""
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set. See .env.example.")

    key = (model_name, system_instruction)
    if key not in _MODEL_CACHE:
        genai.configure(api_key=api_key)
        _MODEL_CACHE[key] = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction,
            generation_config={
                "temperature": 0.2,
                "response_mime_type": "application/json",
            },
        )
    response = _MODEL_CACHE[key].generate_content(user_prompt)
    return response.text


def extract_json(text: str):
    """Best-effort JSON extraction; response_mime_type=json is layer 1, this
    regex fallback is layer 2 for SDKs/models that ignore it."""
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