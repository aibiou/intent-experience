"""Explicit, auditable deliberation workflow; no autonomous hidden loops."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Callable

from .core import (
    AgentConfig, AgentFinding, DiscussionInput, chair_prompt,
    format_brief, independent_prompt, red_team_prompt, revision_prompt,
)
from .llm import ModelCallError, OpenAICompatibleClient


def _run_one(client: OpenAICompatibleClient, agent: AgentConfig, round_name: str,
             messages: list[dict[str, str]], max_tokens: int) -> AgentFinding:
    try:
        content, elapsed = client.complete(agent, messages, max_tokens=max_tokens)
        return AgentFinding(agent.agent_id, agent.role, round_name, content,
                            "success", "", elapsed)
    except ModelCallError as exc:
        return AgentFinding(agent.agent_id, agent.role, round_name, "", "failed",
                            f"{exc.code}: {exc.safe_message}", exc.elapsed_seconds)
    except Exception as exc:
        return AgentFinding(agent.agent_id, agent.role, round_name, "", "failed",
                            f"UNEXPECTED_{type(exc).__name__}: sensitive details hidden", None)


def _parallel(client: OpenAICompatibleClient, configs: list[AgentConfig], round_name: str,
              prompt_builder: Callable[[AgentConfig], list[dict[str, str]]],
              max_tokens: int) -> list[AgentFinding]:
    if not configs:
        return []
    completed: dict[str, AgentFinding] = {}
    with ThreadPoolExecutor(max_workers=min(8, len(configs))) as pool:
        futures = {
            pool.submit(_run_one, client, c, round_name, prompt_builder(c), max_tokens): c
            for c in configs
        }
        for future in as_completed(futures):
            config = futures[future]
            try:
                completed[config.agent_id] = future.result()
            except Exception:
                completed[config.agent_id] = AgentFinding(
                    config.agent_id, config.role, round_name, "", "failed",
                    "UNEXPECTED_ERROR: agent task failed", None)
    return [completed[c.agent_id] for c in configs]


def run_deliberation(topic: DiscussionInput, agents: list[AgentConfig],
                     chair: AgentConfig, red_team: AgentConfig,
                     client: OpenAICompatibleClient | None = None,
                     max_tokens: int = 1800,
                     progress: Callable[[str], None] | None = None) -> dict:
    """Independent analysis -> red team -> revisions -> chair synthesis."""
    client = client or OpenAICompatibleClient()
    enabled = [a for a in agents if a.enabled]
    if len(enabled) < 2:
        raise ValueError("At least two enabled analysis agents are required.")
    all_configs = enabled + [red_team, chair]
    started = datetime.now(timezone.utc).isoformat()
    # Include actual user-supplied evidence excerpts/notes, not only an item count.
    brief = format_brief(topic)

    if progress:
        progress("Round 1/4 — independent positions; members cannot see colleagues' outputs.")
    first = _parallel(client, enabled, "independent",
                      lambda a: independent_prompt(a, brief), max_tokens)

    if progress:
        progress("Round 2/4 — adversarial red-team review.")
    red = _run_one(client, red_team, "red-team",
                   red_team_prompt(brief, first), max_tokens)

    if progress:
        progress("Round 3/4 — members respond to the strongest critique.")
    revisions = _parallel(
        client, enabled, "revision",
        lambda a: revision_prompt(
            a, brief,
            next((f for f in first if f.agent_id == a.agent_id),
                 AgentFinding(a.agent_id, a.role, "independent", "", "failed", "No first-round result")),
            first, red),
        max_tokens,
    )

    if progress:
        progress("Round 4/4 — chair synthesizes evidence, disagreements, experiments and decision gates.")
    chair_result = _run_one(client, chair, "chair",
                             chair_prompt(brief, first, red, revisions), max_tokens)
    ended = datetime.now(timezone.utc).isoformat()
    return {
        "schema_version": "odt.decision-board.v0.1",
        "started_at": started,
        "ended_at": ended,
        "title": topic.title,
        "brief": brief,
        "agent_configuration": [c.safe_dict() for c in all_configs],
        "rounds": {
            "independent": [f.to_dict() for f in first],
            "red_team": red.to_dict(),
            "revision": [f.to_dict() for f in revisions],
            "chair": chair_result.to_dict(),
        },
        "decision_status": "AI_DRAFT_REQUIRES_HUMAN_REVIEW",
        "limitations": [
            "Model outputs are analysis opinions, not independent evidence.",
            "User-supplied URLs were not automatically fetched.",
            "Human owner must verify material factual claims and record the final decision.",
            "API keys are excluded from result exports.",
        ],
    }


def build_markdown_export(result: dict) -> str:
    rounds = result["rounds"]
    pieces = [
        f"# AI Decision Board — {result['title']}",
        f"\n- Started: {result['started_at']}\n- Ended: {result['ended_at']}",
        "- Status: generated analysis; not a human-approved decision",
        "- Model outputs are opinions, not evidence. Verify external claims independently.",
        "\n## Decision brief\n\n" + result["brief"],
        "\n## Round 1 — Independent positions",
    ]
    for finding in rounds["independent"]:
        pieces.append(f"\n### {finding['role']} — {finding['status']}\n\n{finding['content'] or finding['error']}")
    red = rounds["red_team"]
    pieces.append(f"\n## Round 2 — Red-team critique\n\n{red['content'] or red['error']}")
    pieces.append("\n## Round 3 — Revised positions")
    for finding in rounds["revision"]:
        pieces.append(f"\n### {finding['role']} — {finding['status']}\n\n{finding['content'] or finding['error']}")
    chair = rounds["chair"]
    pieces.append(f"\n## Final synthesis — {chair['status']}\n\n{chair['content'] or chair['error']}")
    pieces.append("\n## Governance\n\nHuman owner must record the final decision, rationale, and follow-up evidence separately.")
    return "\n".join(pieces)
