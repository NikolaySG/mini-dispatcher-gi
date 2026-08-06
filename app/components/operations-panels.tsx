import type { ReactNode } from "react";

type ActivityEvent = { date: string; title: string; text: string };
export type OperationsTask = {
  id: string;
  title: string;
  owner: string;
  status: string;
  priority: string;
  due: string;
  history: ActivityEvent[];
};

export function TechnicalPanel({ eyebrow, title, badge, children, className = "" }: {
  eyebrow: string; title: string; badge: string; children: ReactNode; className?: string;
}) {
  return <article className={`technical-panel ${className}`}>
    <header><div><p className="kicker">{eyebrow}</p><h3>{title}</h3></div><span>{badge}</span></header>
    {children}
  </article>;
}

export function OperationsPanels({ tasks, onSelect }: { tasks: OperationsTask[]; onSelect: (id: string) => void }) {
  const problemTasks = [...tasks]
    .filter((task) => task.status === "Просрочено" || task.status === "Требует уточнения" || task.priority === "Критический")
    .sort((left, right) => problemRank(left) - problemRank(right) || left.due.localeCompare(right.due))
    .slice(0, 6);
  const changes = tasks.flatMap((task) => task.history.map((event) => ({ task, event })))
    .sort((left, right) => historyTimestamp(right.event.date) - historyTimestamp(left.event.date))
    .slice(0, 6);

  return <section className="operations-deck" aria-label="Оперативная аналитика">
    <TechnicalPanel eyebrow="ПРИОРИТЕТ РУКОВОДИТЕЛЯ" title="Проблемные поручения" badge={`${problemTasks.length} В ФОКУСЕ`} className="problem-panel">
      <div className="problem-list">
        {problemTasks.map((task) => <button key={task.id} onClick={() => onSelect(task.id)}>
          <i className={task.status === "Просрочено" ? "critical" : "warning"} />
          <span><small>{task.id} · {task.owner}</small><strong>{task.title}</strong></span>
          <em>{task.status}</em>
        </button>)}
        {!problemTasks.length && <p className="panel-empty">Проблемных поручений нет.</p>}
      </div>
    </TechnicalPanel>
    <TechnicalPanel eyebrow="ЖУРНАЛ АКТИВНОСТИ" title="Последние изменения" badge={`${changes.length} СОБЫТИЙ`} className="changes-panel">
      <div className="change-list">
        {changes.map(({ task, event }, index) => <button key={`${task.id}-${event.date}-${index}`} onClick={() => onSelect(task.id)}>
          <time>{event.date}</time><span><strong>{event.title}</strong><small>{task.id} · {task.title}</small></span>
        </button>)}
        {!changes.length && <p className="panel-empty">История изменений пока пуста.</p>}
      </div>
    </TechnicalPanel>
  </section>;
}

function problemRank(task: OperationsTask) {
  if (task.priority === "Критический") return 0;
  if (task.status === "Просрочено") return 1;
  return 2;
}

function historyTimestamp(value: string) {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})(?:,\s*(\d{2}):(\d{2}))?/);
  if (!match) return 0;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0));
}
