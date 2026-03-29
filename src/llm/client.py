"""Async LiteLLM wrapper with retry logic and JSON extraction."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Optional

import litellm

from src.config import settings

logger = logging.getLogger(__name__)

# ── Helpers ─────────────────────────────────────────────────────────────


def _extract_json(text: str) -> Any:
    """Attempt to parse JSON from an LLM response.

    Strategy:
      1. Direct ``json.loads`` on the full text.
      2. Extract the first fenced ```json ... ``` block.
      3. Find the first top-level ``[`` or ``{`` and parse from there.
    """
    # 1. Direct parse
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        pass

    # 2. Fenced code block
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # 3. First bracket / brace
    for char, close in [("[", "]"), ("{", "}")]:
        start = text.find(char)
        if start == -1:
            continue
        # Find matching close walking backwards from end
        end = text.rfind(close)
        if end == -1 or end <= start:
            continue
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            continue

    raise ValueError(f"Could not extract JSON from LLM response: {text[:200]}...")


# ── Core call ───────────────────────────────────────────────────────────


async def llm_call(
    messages: list[dict[str, str]],
    *,
    model: Optional[str] = None,
    response_format: Optional[dict] = None,
    temperature: float = 0.2,
    max_retries: int = 3,
) -> str:
    """Call LiteLLM with automatic retry and exponential backoff.

    Returns the raw assistant message content as a string.
    """
    model = model or settings.LITELLM_MODEL_FAST

    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if settings.LLM_API_KEY:
        kwargs["api_key"] = settings.LLM_API_KEY
    if settings.LLM_BASE_URL:
        kwargs["api_base"] = settings.LLM_BASE_URL
    if response_format is not None:
        kwargs["response_format"] = response_format

    last_exc: Optional[Exception] = None
    for attempt in range(max_retries):
        try:
            response = await litellm.acompletion(**kwargs)
            content: str = response.choices[0].message.content  # type: ignore[union-attr]
            return content
        except Exception as exc:
            last_exc = exc
            delay = 2**attempt
            logger.warning(
                "LLM call attempt %d/%d failed (%s), retrying in %ds...",
                attempt + 1,
                max_retries,
                exc,
                delay,
            )
            await asyncio.sleep(delay)

    raise RuntimeError(
        f"LLM call failed after {max_retries} attempts"
    ) from last_exc


async def llm_call_reasoning(
    messages: list[dict[str, str]],
    *,
    model: Optional[str] = None,
    response_format: Optional[dict] = None,
    temperature: float = 0.2,
    max_retries: int = 3,
) -> str:
    """Call the reasoning model (slower, higher quality).

    Same interface as ``llm_call`` but defaults to the reasoning model.
    """
    model = model or settings.LITELLM_MODEL_REASONING
    return await llm_call(
        messages,
        model=model,
        response_format=response_format,
        temperature=temperature,
        max_retries=max_retries,
    )


async def llm_call_json(
    messages: list[dict[str, str]],
    *,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_retries: int = 3,
) -> Any:
    """Call LLM and parse the response as JSON.

    Uses ``_extract_json`` with multiple fallback strategies.
    """
    raw = await llm_call(
        messages,
        model=model,
        temperature=temperature,
        max_retries=max_retries,
    )
    return _extract_json(raw)
