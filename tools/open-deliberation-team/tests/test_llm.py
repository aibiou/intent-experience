from unittest.mock import Mock

import pytest
import requests

from team_ai.core import AgentConfig
from team_ai.llm import ModelCallError, OpenAICompatibleClient


def config(api_key="secret-key"):
    return AgentConfig("a", "Analyst", "test", "https://example.invalid/v1", "test-model", api_key)


def test_client_posts_to_compatible_chat_completions(monkeypatch):
    response = Mock()
    response.status_code = 200
    response.json.return_value = {"choices": [{"message": {"content": "structured answer"}}]}
    post = Mock(return_value=response)
    monkeypatch.setattr("team_ai.llm.requests.post", post)
    text, elapsed = OpenAICompatibleClient().complete(config(), [{"role": "user", "content": "hello"}])
    assert text == "structured answer"
    assert elapsed >= 0
    assert post.call_args.args[0] == "https://example.invalid/v1/chat/completions"
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer secret-key"


def test_auth_error_does_not_leak_provider_body_or_key(monkeypatch):
    response = Mock()
    response.status_code = 401
    response.text = "secret-key leaked server side"
    post = Mock(return_value=response)
    monkeypatch.setattr("team_ai.llm.requests.post", post)
    with pytest.raises(ModelCallError) as exc:
        OpenAICompatibleClient().complete(config(), [{"role": "user", "content": "hello"}])
    assert exc.value.code == "AUTH_ERROR"
    assert "secret-key" not in str(exc.value)
    assert "secret-key" not in exc.value.safe_message


def test_timeout_is_classified_without_raw_exception(monkeypatch):
    def timeout(*args, **kwargs):
        raise requests.Timeout("provider diagnostic with private data")
    monkeypatch.setattr("team_ai.llm.requests.post", timeout)
    with pytest.raises(ModelCallError) as exc:
        OpenAICompatibleClient(timeout_seconds=1).complete(config(), [{"role": "user", "content": "hello"}])
    assert exc.value.code == "TIMEOUT"
    assert "private data" not in str(exc.value)
