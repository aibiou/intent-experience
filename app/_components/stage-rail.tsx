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
        return (
          <li
            key={item.step}
            className={`stage-rail-item${isCurrent ? ' is-current' : ''}${isDone ? ' is-done' : ''}`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span className="stage-rail-dot" />
            <span className="stage-rail-label">{item.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
