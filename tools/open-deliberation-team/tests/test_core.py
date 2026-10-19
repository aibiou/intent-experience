import json

from team_ai.core import AgentConfig, AgentFinding, DiscussionInput, EvidenceItem, format_brief, parse_json_object


def test_parse_json_object_plain_and_fenced():
    assert parse_json_object('{"decision":"NARROW","confidence":75}') == {"decision": "NARROW", "confidence": 75}
    assert parse_json_object('Here is output:\n```json\n{"ok":true}\n```') == {"ok": True}


def test_non_object_json_is_rejected():
    assert parse_json_object("not json") is None
    assert parse_json_object("[1, 2]") is None


def test_api_key_is_excluded_from_safe_config():
    config = AgentConfig("a", "role", "mission", "https://example.com/v1", "model", "VERY_SECRET_KEY")
    safe = config.safe_dict()
    assert "api_key" not in safe
    assert "VERY_SECRET_KEY" not in json.dumps(safe)


def test_url_alone_is_not_claimed_as_verified():
    brief = format_brief(DiscussionInput(
        "t", "q", "c",
        evidence=[EvidenceItem("Source", "web", "", "https://example.com")],
    ))
    assert "URL alone does not mean content was fetched or verified" in brief


def test_empty_evidence_does_not_invent_sources():
    brief = format_brief(DiscussionInput("t", "q", "c"))
    assert "Do not invent sources" in brief


def test_finding_is_serializable():
    finding = AgentFinding("a", "role", "round", "opinion", latency_seconds=0.2)
    assert json.loads(json.dumps(finding.to_dict()))["status"] == "success"
