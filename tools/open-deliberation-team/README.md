# Open Deliberation Team | 开源 AI 合议团队

一个本地优先、模型可配置、过程可追踪的多模型决策评审工具。用于产品战略、技术架构、投资取舍，以及其他需要认真检验反对意见的决策。

定位：辅助人类作出更好的决策，不是自动决策者。AI 之间的共识不构成事实证明，最终决策责任仍属于人类负责人。

## 本地运行

需要 Python 3.10 或更新版本。

    cd tools/open-deliberation-team
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    streamlit run app.py

Windows PowerShell 激活命令为 .venv\Scripts\Activate.ps1。

## 工作流程

1. 多个分析角色各自独立立论；第一轮彼此看不到对方意见。
2. 反方审查员寻找未证实假设、逻辑漏洞、强替代方案和停止条件。
3. 分析员逐一回应质疑，可以修正也可以坚持分歧。
4. 主持人形成决策备忘录，不以简单多数票代替论证。
5. 人类记录最终裁决、理由和后续验证动作。

## 模型配置

在界面中为模型配置 Base URL、Model ID 和 API Key。适配 OpenAI-compatible Chat Completions 的端点。每个角色可以分配不同模型配置；如果多个角色使用同一个模型，它们并不因此构成真正独立的智能证据。

每轮最多 10 次模型调用。真实调用会产生服务商费用。API Key 不写入导出的审议记录。

## 验证范围与限制

自动化测试用于验证工作流、错误处理和密钥不进入导出等工程属性。它们不能证明合议质量高于单模型，也不能替代真实用户研究或外部证据核验。

当前版本不会自动抓取输入的 URL；请粘贴来源内容或经过核对的摘录。任何外部事实仍需独立核验。UI 当前没有内置登录认证，不应直接暴露在公网。

## 许可

MIT License。