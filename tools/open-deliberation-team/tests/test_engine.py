from team_ai.core import AgentConfig, DiscussionInput, EvidenceItem
from team_ai.engine import build_markdown_export, run_deliberation
from team_ai.llm import ModelCallError


class FakeClient:
    """Deterministic test double, not evidence of real-model quality."""
    def __init__(self, fail_agent=None):
        self.fail_agent = fail_agent
        self.calls = []

    def complete(self, config, messages, max_tokens=1800):
        self.calls.append((config.agent_id, messages[0]["content"], messages[1]["content"]))
        if config.agent_id == self.fail_agent:
            raise ModelCallError("TEST_FAILURE", "controlled test failure", 0.01)
        return f"Synthetic output from {config.role}; fixture only.", 0.01


def configs():
    agents = [
        AgentConfig("product", "Product strategist", "strategy", "http://localhost/v1", "test", "not-used"),
        AgentConfig("user-value", "User value", "customer", "http://localhost/v1", "test", "not-used"),
        AgentConfig("skeptic", "Skeptic", "failure", "http://localhost/v1", "test", "not-used"),
        AgentConfig("engineering", "Engineering", "technical", "http://localhost/v1", "test", "not-used"),
    ]
    red = AgentConfig("red-team", "Red Team", "challenge", "http://localhost/v1", "test", "not-used")
    chair = AgentConfig("chair", "Chair", "synthesis", "http://localhost/v1", "test", "not-used")
    return agents, red, chair


def test_workflow_fixed_stages_and_key_free_export():
    agents, red, chair = configs()
    client = FakeClient()
    result = run_deliberation(DiscussionInput("Title", "Question?", "Context"),
                              agents, chair, red, client=client)
    assert len(client.calls) == 10
    assert result["decision_status"] == "AI_DRAFT_REQUIRES_HUMAN_REVIEW"
    assert len(result["rounds"]["independent"]) == 4
    assert len(result["rounds"]["revision"]) == 4
    assert "not-used" not in str(result)


def test_independent_round_does_not_contain_other_agent_outputs():
    agents, red, chair = configs()
    client = FakeClient()
    run_deliberation(DiscussionInput("Title", "Question?", "Context"),
                     agents, chair, red, client=client)
    first_round_calls = [c for c in client.calls if c[0] in {a.agent_id for a in agents}]
    assert len(first_round_calls) == 4
    assert all("Synthetic output" not in user_text for _, _, user_text in first_round_calls)


def test_agent_failure_is_preserved_and_not_silently_marked_success():
    agents, red, chair = configs()
    client = FakeClient(fail_agent="user-value")
    result = run_deliberation(DiscussionInput("Title", "Question?", "Context"),
                              agents, chair, red, client=client)
    failed = next(f for f in result["rounds"]["independent"] if f["agent_id"] == "user-value")
    assert failed["status"] == "failed"
    assert "TEST_FAILURE" in failed["error"]
    assert result["rounds"]["chair"]["status"] == "success"



def test_supplied_evidence_excerpt_reaches_independent_analysis():
    agents, red, chair = configs()
    client = FakeClient()
    topic = DiscussionInput(
        "Evidence test", "Is this supported?", "Context",
        evidence=[EvidenceItem("Interview notes", "user-research",
                               "VERIFIED_EXCERPT_TOKEN", "https://example.invalid")],
    )
    run_deliberation(topic, agents, chair, red, client=client)
    first_round = [call for call in client.calls if call[0] in {a.agent_id for a in agents}]
    assert len(first_round) == 4
    assert all("VERIFIED_EXCERPT_TOKEN" in call[2] for call in first_round)


def test_requires_two_enabled_analysis_agents():
    agents, red, chair = configs()
    for agent in agents[1:]:
        agent.enabled = False
    with pytest.raises(ValueError, match="at least two enabled"):
        run_deliberation(DiscussionInput("T", "Q", "C"), agents, chair, red,
                         client=FakeClient())


def test_markdown_export_contains_synthesis_and_governance():
    agents, red, chair = configs()
    result = run_deliberation(DiscussionInput("Export test", "Question?", "Context"),
                              agents, chair, red, client=FakeClient())
    report = build_markdown_export(result)
    assert "Final synthesis" in report
    assert "not a human-approved decision" in report
    assert "Human owner must record" in report
