import type { CSSProperties } from "react";

type CommandCoreProps = {
  attentionCount: number;
  attentionShare: number;
  criticalCount: number;
  nearDueCount: number;
  tone: string;
};

export function CommandCore({ attentionCount, attentionShare, criticalCount, nearDueCount, tone }: CommandCoreProps) {
  const state = criticalCount > 0
    ? "Есть критические отклонения"
    : attentionCount > 0
      ? "Требуется внимание"
      : "Система стабильна";
  const code = attentionCount === 0 ? "NORMAL" : attentionShare <= 25 ? "STABLE" : attentionShare <= 50 ? "MONITOR" : "ALERT";

  return <>
    <div className="completion-core" aria-label={`Ядро диспетчерской: ${attentionCount} поручений требуют решения. ${state}`}>
      <div className="core-ring" style={{ "--progress": `${attentionShare * 3.6}deg`, "--core-tone": tone } as CSSProperties}>
        <span className="core-orbit orbit-one" aria-hidden="true" />
        <span className="core-orbit orbit-two" aria-hidden="true" />
        <i className="core-node node-a" aria-hidden="true" /><i className="core-node node-b" aria-hidden="true" />
        <div><strong>{attentionCount}</strong><span>требуют решения</span></div>
      </div>
      <p className="core-state-label">{state}</p>
      <div className="core-caption"><i style={{ background: tone, boxShadow: `0 0 10px ${tone}` }} /><span>Контур внимания</span><b style={{ color: tone }}>{code}</b></div>
    </div>
    <div className="risk-radar" aria-label="Критические сроки">
      <div className="radar-grid" aria-hidden="true"><span className="radar-sweep" /><i className="blip b1" /><i className="blip b2" /><i className="blip b3" /></div>
      <div className="risk-readout">
        <span>КРИТИЧЕСКИЙ КОНТУР</span>
        <div><strong>{criticalCount}</strong><small>критический приоритет</small></div>
        <div><strong>{nearDueCount}</strong><small>срок до 7 дней</small></div>
      </div>
    </div>
  </>;
}
