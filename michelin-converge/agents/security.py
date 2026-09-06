"""
Security Harness — Layer 1 (deterministic, code-enforced).

Layer 2 is an LLM security sentinel (see prompts.py / hooks.py), but its
verdict can only *add* restrictions, never remove a Layer-1 finding. The
hierarchy is: BLOCKED (L1) > BLOCKED (L2) > SUSPICIOUS > PASS.

Controls:
  1. Prompt-injection detection    — data-driven regexes from
     data/security_policy.json (swappable without code changes)
  2. Restricted-topic detection    — warranty/legal/safety/recall keywords
  3. PII redaction                 — reversible token map; raw PII never
                                     leaves the process to an external model
  4. Output exfiltration guard     — scans model output for secrets/PII
  5. Deterministic veto            — hard findings cannot be LLM-overridden
"""

import json
import os
import re

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

_DEFAULT_POLICY = {
    "injection_patterns": [
        r"ignore .{0,40}instructions?",
        r"disregard .{0,40}instructions?",
        r"forget .{0,40}instructions?",
        r"system prompt",
        r"you are now",
        r"you will now",
        r"new (personality|role|mode)",
        r"developer mode",
        r"jail ?break",
        r"DAN mode",
        r"do anything now",
        r"repeat (everything|all|the text) (above|you|written)",
        r"print (your|the) (system )?prompt",
        r"base64[: ]",
    ],
    "restricted_topics": {
        "warranty": ["warranty", "warrant"],
        "legal": ["legal", "lawsuit", "sue", "liability", "entitled", "law"],
        "safety": ["injury", "injured", "hurt", "accident", "burst", "blew out", "exploded"],
        "recall": ["recall", "defect", "defective"],
    },
    "pii_patterns": {
        "email": r"[\w.+-]+@[\w-]+\.[\w.]+",
        "phone_in": r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}",
        "api_key": r"(?i)(api[_-]?key|secret|token|bearer)\s*[:=]\s*['\"]?[\w\-]{16,}",
    },
    "blocked_threshold": 1,
}

_POLICY_CACHE = {}


def _load_policy() -> dict:
    if _POLICY_CACHE:
        return _POLICY_CACHE
    path = os.path.join(DATA_DIR, "security_policy.json")
    try:
        with open(path) as f:
            _POLICY_CACHE.update(_DEFAULT_POLICY)
            _POLICY_CACHE.update(json.load(f))
    except OSError:
        _POLICY_CACHE.update(_DEFAULT_POLICY)
    return _POLICY_CACHE


def scan_input(raw_text: str) -> dict:
    """Deterministic injection + restricted-topic scan of untrusted input.
    Returns {level: PASS|SUSPICIOUS|BLOCKED, flags: [...]}."""
    pol = _load_policy()
    text = (raw_text or "").lower()
    flags = []

    hits = [p for p in pol["injection_patterns"] if re.search(p, text)]
    if hits:
        flags.append("prompt_injection_detected")
        flags.append(f"injection_patterns_matched:{len(hits)}")

    for category, words in pol["restricted_topics"].items():
        if any(w in text for w in words):
            flags.append(f"restricted_topic:{category}")

    # Entropy heuristics: very long token blobs (obfuscated payloads)
    for blob in re.findall(r"[A-Za-z0-9+/=]{80,}", raw_text or ""):
        flags.append("obfuscated_payload_detected")
        break

    if "prompt_injection_detected" in flags or "obfuscated_payload_detected" in flags:
        level = "BLOCKED"
    elif flags:
        level = "SUSPICIOUS"
    else:
        level = "PASS"

    return {"level": level, "flags": flags}


def redact_pii(text: str) -> dict:
    """Replace PII with reversible tokens. The mapping stays server-side;
    external models only ever see the redacted text."""
    pol = _load_policy()
    mapping = {}
    count = 0
    out = text or ""
    for kind, pattern in pol["pii_patterns"].items():
        def _sub(m, kind=kind):
            nonlocal count
            count += 1
            token = f"<{kind.upper()}_{count}>"
            mapping[token] = m.group(0)
            return token
        out = re.sub(pattern, _sub, out)
    return {"redacted_text": out, "mapping": mapping, "count": count}


def guard_output(text: str) -> dict:
    """Scan agent output before it reaches state/trace/frontend.
    Detects leaked secrets and un-redacted PII shapes."""
    if not text:
        return {"clean": True, "flags": []}
    pol = _load_policy()
    flags = []
    for kind, pattern in pol["pii_patterns"].items():
        if re.search(pattern, text):
            flags.append(f"output_contains_{kind}")
    return {"clean": not flags, "flags": flags}


def is_blocked(scan: dict) -> bool:
    return scan.get("level") == "BLOCKED"