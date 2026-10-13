import { FIRST_EXPERIENCE_STAGES } from '../../src/experience/presentation';

export interface StageRailProps {
  stage: string;
  branchActive: boolean;
}

// 六阶段呈现（E2 §6——阶段轴为状态机映射，视觉样式
 // 不在冻结范围）。分支探索中呈现 Branch 面。
export function StageRail({ stage, branchActive }: StageRailProps) {
  const current = branchActive && stage === 'SIMULATION' ? 'BRANCH' : stage;
  const currentIndex = FIRST_EXPERIENCE_STAGES.findIndex(
    (item) => item.stateMachineStage === current,
  );

  return (
    <ol className="stage-rail" aria-label="体验阶段">
      {FIRST_EXPERIENCE_STAGES.map((item, index) => {
        const isCurrent = index === currentIndex;
        const isDone = index < currentIndex;
        // 轨道标签取中文短名（「Curiosity（好奇）」→「好奇」
        // ——顶栏横向空间有限，英文名省略，完整名见 title）。
        const match = /（([^）]*)）/.exec(item.label);
        const shortLabel = match !== null ? match[1] : item.label;
        return (
          <li
            key={item.step}
            className={`stage-rail-item${isCurrent ? ' is-current' : ''}${isDone ? ' is-done' : ''}`}
            aria-current={isCurrent ? 'step' : undefined}
            title={item.label}
          >
            <span className="stage-rail-dot" />
            <span className="stage-rail-label">{shortLabel}</span>
          </li>
        );
      })}
    </ol>
  );
}
