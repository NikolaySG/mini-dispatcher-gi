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
    <div className="attention-card" aria-label={`${attentionCount} поручений требуют решения. ${state}`}>
      <div className="attention-head"><span>КОНТУР ВНИМАНИЯ</span><b style={{ color: tone }}>{code}</b></div>
      <strong className="attention-value">{attentionCount}</strong>
      <span className="attention-label">требуют решения</span>
      <div className="attention-track"><i style={{ width: `${attentionShare}%`, background: tone }} /></div>
      <p>{state}</p>
    </div>
    <div className="risk-summary" aria-label="Критические сроки">
      <div className="risk-summary-head"><span>КРИТИЧЕСКИЙ КОНТУР</span><b>LIVE</b></div>
      <div className="risk-readout">
        <div><strong>{criticalCount}</strong><small>критический приоритет</small></div>
        <div><strong>{nearDueCount}</strong><small>срок до 7 дней</small></div>
      </div>
    </div>
  </>;
}
