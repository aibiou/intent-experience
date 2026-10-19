"""Core data models and evidence-disciplined prompt builders."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Iterable
import json
import re


@dataclass
class AgentConfig:
    agent_id: str
    role: str
    mission: str
    base_url: str
    model: str
    api_key: str = field(default="", repr=False)
    temperature: float = 0.2
    enabled: bool = True

    def safe_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("api_key", None)
        return data


@dataclass
class EvidenceItem:
    label: str
    source_type: str
    content: str
    url: str = ""


@dataclass
class DiscussionInput:
    title: str
    question: str
    context: str
    constraints: str = ""
    desired_decision: str = ""
    prior_discussion: str = ""
    evidence: list[EvidenceItem] = field(default_factory=list)


@dataclass
class AgentFinding:
    agent_id: str
    role: str
    round_name: str
    content: str
    status: str = "success"
    error: str = ""
    latency_seconds: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def parse_json_object(text: str) -> dict[str, Any] | None:
    """Best-effort parse of a JSON object; never executes model output."""
    if not text or not text.strip():
        return None
    candidate = re.sub(r"^\s*```(?:json)?\s*", "", text.strip(), flags=re.I)
    candidate = re.sub(r"\s*```$", "", candidate)
    try:
        obj = json.loads(candidate)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        start, end = candidate.find("{"), candidate.rfind("}")
        if start >= 0 and end > start:
            try:
                obj = json.loads(candidate[start:end + 1])
                return obj if isinstance(obj, dict) else None
            except json.JSONDecodeError:
                return None
        return None


def format_evidence(items: Iterable[EvidenceItem]) -> str:
    items = list(items)
    if not items:
        return (
            "No external evidence was supplied. Do not invent sources, citations, "
            "statistics, or market research. Mark unverified claims as hypotheses."
        )
    blocks = []
    for i, item in enumerate(items, 1):
        blocks.append(
            f"[{i}] {item.label or 'Untitled'}\nType: {item.source_type}\n"
            f"URL: {item.url or 'not supplied'}\nSupplied content/notes:\n"
            f"{item.content}\nEvidence rule: a URL alone does not mean content was fetched or verified."
        )
    return "\n\n".join(blocks)


def format_brief(d: DiscussionInput) -> str:
    return (
        f"DECISION BRIEF\nTitle: {d.title}\nDecision question: {d.question}\n"
        f"Context: {d.context or '(not supplied)'}\n"
        f"Constraints: {d.constraints or '(not supplied)'}\n"
        f"Desired decision / horizon: {d.desired_decision or '(not supplied)'}\n"
        f"Prior discussion / imported views:\n{d.prior_discussion or '(none supplied)'}\n"
        f"Evidence register:\n{format_evidence(d.evidence)}\n\n"
        "Epistemic rules:\n"
        "- Separate observable facts, user-supplied claims, assumptions, inferences, and unknowns.\n"
        "- Repetition, confidence, or agreement among models is not evidence.\n"
        "- Never invent market size, interviews, external citations, or benchmark results.\n"
        "- Identify what would falsify your own recommendation.\n"
        "- Recommend the smallest experiment that could change the decision."
    )


def independent_prompt(agent: AgentConfig, brief: str) -> list[dict[str, str]]:
    system = (
        f"You are an independent member of a decision review board. Role: {agent.role}.\n"
        f"Specific responsibility: {agent.mission}\n"
        "You have not seen other members' opinions. Preserve intellectual independence. "
        "Do not play a personality; provide rigorous analysis. Distinguish evidence from opinion.\n"
        "Return concise Markdown with headings: Position; What we know; Key assumptions; "
        "Strongest argument for; Strongest argument against; User/problem specificity; "
        "Failure modes/risks; What would change my mind; Smallest decisive experiment; "
        "Recommendation (proceed/narrow/pivot/stop/insufficient evidence); Confidence (0-100%)."
    )
    return [{"role": "system", "content": system},
            {"role": "user", "content": brief + f"\n\nRole lens: {agent.role}\nMission: {agent.mission}"}]


def red_team_prompt(brief: str, first_round: list[AgentFinding]) -> list[dict[str, str]]:
    opinions = "\n\n".join(
        f"### {f.role} ({f.agent_id}) [{f.status}]\n{f.content or f.error}"
        for f in first_round
    )
    system = (
        "You are the independent Red Team / Failure Analyst. Find the most consequential "
        "unsupported assumptions, contradictions, base-rate neglect, ignored alternatives, "
        "and reasons the current recommendation could fail. Do not manufacture disagreement. "
        "Distinguish logical flaws from empirical claims needing verification. Return Markdown with "
        "headings: Most consequential challenge; Claims without evidence; Strongest disagreement; "
        "Stronger alternatives; Kill criteria; Minimal experiment; Questions the board must not hand-wave."
    )
    return [{"role": "system", "content": system},
            {"role": "user", "content": f"{brief}\n\nINDEPENDENT FIRST-ROUND OPINIONS:\n{opinions}"}]


def revision_prompt(agent: AgentConfig, brief: str, own: AgentFinding,
                    first_round: list[AgentFinding], red_team: AgentFinding) -> list[dict[str, str]]:
    others = "\n\n".join(
        f"### {f.role} ({f.agent_id})\n{f.content or f.error}"
        for f in first_round if f.agent_id != agent.agent_id
    )
    system = (
        f"You are {agent.role}, returning for a second-round review after adversarial scrutiny.\n"
        f"Mission remains: {agent.mission}\n"
        "Do not change your view merely to agree. Reassess evidence and logic; state explicitly "
        "what you revise, retain, and why. If evidence is absent, leave the issue unresolved. "
        "Return Markdown with: Revised position; Response to strongest challenge; What I changed "
        "(or why not); Remaining disagreement; Evidence needed next; Recommendation; Confidence (0-100%)."
    )
    user = (
        f"{brief}\n\nYOUR FIRST-ROUND POSITION:\n{own.content or own.error}\n\n"
        f"OTHER FIRST-ROUND POSITIONS:\n{others}\n\nRED-TEAM CRITIQUE:\n{red_team.content or red_team.error}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def chair_prompt(brief: str, first: list[AgentFinding], red: AgentFinding,
                 revised: list[AgentFinding]) -> list[dict[str, str]]:
    def pack(name: str, findings: list[AgentFinding]) -> str:
        return "\n\n".join(
            f"### {f.role} [{f.status}]\n{f.content if f.status == 'success' else 'ERROR: ' + f.error}"
            for f in findings
        )
    system = (
        "You are the Decision Chair. You do not vote and must not force consensus. Synthesize the "
        "best decision from available evidence. Agreement is not evidence. Explicitly label claims "
        "that remain unverified. Do not invent citations. Return a decision memo with these exact "
        "headings: Executive decision; What is supported vs not supported; Target user and use moment "
        "(be specific); Competing strategic options; Strongest case to proceed; Strongest case to stop "
        "or pivot; Unresolved disagreements; Critical assumptions ranked by risk; Decision-changing "
        "experiment (method, sample, baseline, measures, thresholds, duration); Proceed criteria; Pivot "
        "criteria; Stop-investment criteria; Immediate actions (owner role, deliverable, acceptance evidence); "
        "Confidence and limitations. Choose one provisional decision: PROCEED, NARROW, PIVOT, STOP, or "
        "INSUFFICIENT EVIDENCE. Human owner approval is required."
    )
    user = (
        f"{brief}\n\nROUND 1: INDEPENDENT POSITIONS\n{pack('Round 1', first)}"
        f"\n\nRED TEAM:\n{red.content if red.status == 'success' else red.error}"
        f"\n\nROUND 3: REVISED POSITIONS\n{pack('Revised', revised)}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]
