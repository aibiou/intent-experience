"""Minimal OpenAI-compatible Chat Completions client with safe error classification."""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import requests

from .core import AgentConfig


@dataclass
class ModelCallError(RuntimeError):
    code: str
    safe_message: str
    elapsed_seconds: float

    def __str__(self) -> str:
        return f"{self.code}: {self.safe_message}"


class OpenAICompatibleClient:
    def __init__(self, timeout_seconds: int = 120):
        self.timeout_seconds = timeout_seconds

    def complete(self, config: AgentConfig, messages: list[dict[str, str]],
                 max_tokens: int = 1800) -> tuple[str, float]:
        started = time.monotonic()
        if not config.base_url.strip() or not config.model.strip() or not config.api_key:
            raise ModelCallError("CONFIG_MISSING", "Base URL, model ID, and API key are required.",
                                 time.monotonic() - started)
        url = config.base_url.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {config.api_key}",
                   "Content-Type": "application/json"}
        payload: dict[str, Any] = {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": max_tokens,
        }
        try:
            response = requests.post(url, headers=headers, json=payload,
                                     timeout=self.timeout_seconds)
            elapsed = time.monotonic() - started
            if response.status_code >= 400:
                code = f"HTTP_{response.status_code}"
                if response.status_code == 429:
                    code = "RATE_LIMIT"
                elif response.status_code in (401, 403):
                    code = "AUTH_ERROR"
                elif response.status_code >= 500:
                    code = "PROVIDER_ERROR"
                raise ModelCallError(code, "Provider returned an error; raw body hidden.", elapsed)
            data = response.json()
            choices = data.get("choices", [])
            if not choices or not isinstance(choices[0].get("message", {}).get("content"), str):
                raise ModelCallError("INVALID_OUTPUT", "No text content found in response.", elapsed)
            return choices[0]["message"]["content"], elapsed
        except ModelCallError:
            raise
        except requests.Timeout:
            raise ModelCallError("TIMEOUT", "Model request timed out.", time.monotonic() - started)
        except requests.RequestException:
            raise ModelCallError("NETWORK_ERROR", "Network request failed; raw details hidden.",
                                 time.monotonic() - started)
        except (ValueError, TypeError, KeyError):
            raise ModelCallError("INVALID_OUTPUT", "Provider response could not be parsed.",
                                 time.monotonic() - started)
