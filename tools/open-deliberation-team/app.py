from __future__ import annotations

import json
from datetime import datetime, timezone

import streamlit as st

from team_ai.core import AgentConfig, DiscussionInput, EvidenceItem
from team_ai.engine import run_deliberation, build_markdown_export


ROLE_SPECS = [
    ("product-strategy", "Product strategist", "Evaluate strategic coherence, user problem specificity, differentiation, focus, and opportunity cost."),
    ("user-value", "User value reviewer", "Analyze target users, trigger moments, current alternatives, job-to-be-done, willingness to switch, and observable value."),
    ("skeptic", "Skeptic / falsification analyst", "Try to disprove the proposal, expose weak assumptions, ignored alternatives, and conditions under which it should stop."),
    ("engineering", "Engineering and delivery reviewer", "Assess implementation feasibility, operational cost, reliability, privacy, dependencies, and execution risks."),
]

st.set_page_config(page_title="Open Deliberation Team", page_icon="🗳️", layout="wide")
st.title("Open Deliberation Team")
st.caption("开源 AI 合议团队 · 可配置模型 · 独立立论 · 反方审查 · 人类裁决")
st.warning("这是决策辅助工具，不是自动决策者。模型输出不构成事实证据；最终裁决必须由人类负责人作出。")

with st.sidebar:
    st.header("模型端点配置")
    st.caption("使用 OpenAI-compatible Chat Completions API。API Key 只用于当前运行，不进入导出文件。")
    profile_names = ["Model A", "Model B", "Model C"]
    profiles = {}
    for i, name in enumerate(profile_names, 1):
        with st.expander(f"{name} 配置", expanded=(i == 1)):
            p_name = st.text_input("配置名称", value=name, key=f"profile_{i}_name")
            url = st.text_input("API Base URL", placeholder="https://api.example.com/v1", key=f"profile_{i}_url")
            model = st.text_input("模型 ID", placeholder="model-id", key=f"profile_{i}_model")
            api_key = st.text_input("API Key", type="password", key=f"profile_{i}_key")
            temperature = st.slider("Temperature", 0.0, 1.0, 0.2, 0.1, key=f"profile_{i}_temp")
            profiles[name] = {
                "name": p_name.strip() or name,
                "base_url": url.strip(),
                "model": model.strip(),
                "api_key": api_key,
                "temperature": temperature,
            }
    st.divider()
    timeout = st.number_input("单次模型超时（秒）", min_value=15, max_value=300, value=120, step=15)
    max_tokens = st.number_input("每次最大输出 Token", min_value=500, max_value=6000, value=1800, step=100)

def make_agent(agent_id: str, role: str, mission: str, profile_name: str) -> AgentConfig:
    p = profiles[profile_name]
    return AgentConfig(
        agent_id=agent_id, role=role, mission=mission,
        base_url=p["base_url"], model=p["model"], api_key=p["api_key"],
        temperature=p["temperature"], enabled=True,
    )

with st.sidebar:
    st.header("角色分配")
    st.caption("分配在合议前生效。第一轮意见相互隔离；重复使用同一模型不等于独立证据。")
    assignments = {}
    for agent_id, role, mission in ROLE_SPECS:
        assignments[agent_id] = st.selectbox(
            f"{role} 使用哪个模型", profile_names,
            index=0 if agent_id in ("product-strategy", "user-value") else min(1, len(profile_names) - 1),
            key=f"assign_{agent_id}",
        )
    red_assignment = st.selectbox("反方审查员使用哪个模型", profile_names, index=1, key="assign_red")
    chair_assignment = st.selectbox("合议主持人使用哪个模型", profile_names, index=2, key="assign_chair")

st.subheader("定义需要解决的决策")
with st.form("discussion_form"):
    title = st.text_input("议题标题", value="我们的产品方向是否成立？")
    question = st.text_area(
        "需要团队解决的问题",
        value="我们的 AI 原生个人体验引擎具体服务哪些用户？需求强度、差异化和可行性是否足以支持继续投入？",
        height=110,
    )
    context = st.text_area(
        "背景与已知情况",
        value="产品愿景：围绕用户当前意图，动态组织生成式体验，使用户可以理解、探索、模拟、创造、改变方向或结束。首个候选切入点为探索型问题体验。不能将工程可行性当作产品价值证明。",
        height=145,
    )
    constraints = st.text_area(
        "约束与风险边界",
        value="不编造市场规模、用户研究或来源；区分事实、主张、假设和未知；不得用 AI 多数票替代判断；优先提出可能改变投资决策的实验；保留继续、缩小范围、转向、停止或证据不足等结论。",
        height=100,
    )
    desired_decision = st.text_input("希望形成的决策", value="确定下一阶段继续投入、缩小范围、转向还是停止，以及决策依据")
    prior_discussion = st.text_area(
        "导入其他 AI / 团队意见",
        placeholder="粘贴其他模型的结论、访谈记录、竞品分析或反方意见。导入内容将被视为待审查主张，不自动视为事实。",
        height=180,
    )
    evidence_raw = st.text_area(
        "证据登记（每行：类型 | 名称 | URL | 已核实摘录/备注）",
        placeholder="user-research | 访谈记录摘要 |  | 6 名用户中有 4 名描述了同一反复出现的问题\nmarket-research | 行业报告 | https://... | 粘贴已核查的原文摘录",
        height=115,
    )
    submitted = st.form_submit_button("启动 AI 合议", type="primary", use_container_width=True)

if submitted:
    if not title.strip() or not question.strip() or not context.strip():
        st.error("请补齐议题标题、决策问题和背景。")
        st.stop()

    assignments = {}
    all_assignments = list(assignments.values()) + [red_assignment, chair_assignment]
    missing = sorted({
        profile_names[profile_names.index(p)]
        for p in all_assignments
        if not profiles[p]["base_url"] or not profiles[p]["model"] or not profiles[p]["api_key"]
    })
    if missing:
        st.error("以下模型配置仍缺少 Base URL、模型 ID 或 API Key：" + ", ".join(missing))
        st.stop()

    agents = [
        make_agent(agent_id, role, mission, assignments[agent_id])
        for agent_id, role, mission in ROLE_SPECS
    ]
    red_team = make_agent("red-team", "Red Team / Failure Analyst",
                          "Challenge the strongest claims; find missing evidence, contradictions, stronger alternatives, and kill criteria.",
                          red_assignment)
    chair = make_agent("chair", "Decision Chair",
                       "Synthesize evidence without forcing consensus; propose a falsifiable experiment and clear proceed/pivot/stop criteria.",
                       chair_assignment)

    evidence = []
    for line in evidence_raw.splitlines():
        if not line.strip():
            continue
        parts = [x.strip() for x in line.split("|", 3)]
        parts += [""] * (4 - len(parts))
        source_type, label, url, content = parts
        evidence.append(EvidenceItem(
            label=label or f"Source {len(evidence) + 1}",
            source_type=source_type or "user-supplied",
            url=url,
            content=content,
        ))

    topic = DiscussionInput(
        title=title.strip(), question=question.strip(), context=context.strip(),
        constraints=constraints.strip(), desired_decision=desired_decision.strip(),
        prior_discussion=prior_discussion.strip(), evidence=evidence,
    )
    progress_box = st.status("正在执行四阶段合议……", expanded=True)
    logs = []
    def report(message: str) -> None:
        logs.append(message)
        progress_box.write(message)

    from team_ai.llm import OpenAICompatibleClient
    try:
        result = run_deliberation(
            topic, agents, chair, red_team,
            client=OpenAICompatibleClient(timeout_seconds=int(timeout)),
            max_tokens=int(max_tokens), progress=report,
        )
    except Exception as exc:
        progress_box.update(label="合议未能完成", state="error")
        st.error(f"{type(exc).__name__}: {exc}")
        st.stop()
    progress_box.update(label="合议结束；请检查失败记录和未解决分歧", state="complete", expanded=False)
    st.session_state["odt_result"] = result
    st.session_state["odt_logs"] = logs

if "odt_result" in st.session_state:
    result = st.session_state["odt_result"]
    rounds = result["rounds"]
    st.divider()
    st.subheader("合议结果与证据记录")
    independent = rounds["independent"]
    revised = rounds["revision"]
    success_first = sum(x["status"] == "success" for x in independent)
    success_revision = sum(x["status"] == "success" for x in revised)
    c1, c2, c3 = st.columns(3)
    c1.metric("独立分析成功", f"{success_first}/{len(independent)}")
    c2.metric("回应质疑成功", f"{success_revision}/{len(revised)}")
    c3.metric("主持人结果", rounds["chair"]["status"].upper())
    st.info("AI_DRAFT_REQUIRES_HUMAN_REVIEW：该记录不是自动批准的产品或商业决策。")
    chair_content = rounds["chair"].get("content", "")
    if chair_content:
        st.markdown(chair_content)
    else:
        st.error(rounds["chair"].get("error", "主持人没有生成结论。"))

    with st.expander("第一轮：独立立论", expanded=False):
        tabs = st.tabs([f"{x['role']} · {x['status']}" for x in independent])
        for tab, finding in zip(tabs, independent):
            with tab:
                st.markdown(finding.get("content") or finding.get("error") or "无输出")
    with st.expander("第二轮：反方审查", expanded=False):
        red = rounds["red_team"]
        st.markdown(red.get("content") or red.get("error") or "无输出")
    with st.expander("第三轮：回应与修正", expanded=False):
        tabs = st.tabs([f"{x['role']} · {x['status']}" for x in revised])
        for tab, finding in zip(tabs, revised):
            with tab:
                st.markdown(finding.get("content") or finding.get("error") or "无输出")

    markdown_export = build_markdown_export(result)
    st.download_button("下载 Markdown 决策报告", data=markdown_export,
                       file_name="decision-board-report.md", mime="text/markdown")
    st.download_button("下载完整 JSON 记录", data=json.dumps(result, ensure_ascii=False, indent=2),
                       file_name="decision-board-record.json", mime="application/json")
    st.subheader("人类最终裁决")
    final_decision = st.selectbox(
        "负责人裁决",
        ["继续验证", "缩小范围", "转向", "停止投入", "证据不足，暂不裁决"],
        key="human_decision",
    )
    rationale = st.text_area("裁决理由与关键依据", key="human_rationale")
    follow_up = st.text_area("下一步实验、负责人、期限与验收证据", key="human_followup")
    if st.button("导出人类裁决记录"):
        decision_record = {
            "discussion_title": result["title"],
            "discussion_started_at": result["started_at"],
            "human_decision": final_decision,
            "rationale": rationale,
            "follow_up": follow_up,
            "approved_by_human": True,
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
        }
        st.download_button(
            "下载人类裁决 JSON",
            data=json.dumps(decision_record, ensure_ascii=False, indent=2),
            file_name="human-decision-record.json",
            mime="application/json",
            key="download_human_decision",
        )
