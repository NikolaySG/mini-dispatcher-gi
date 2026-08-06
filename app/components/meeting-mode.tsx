"use client";

import { useEffect } from "react";
import type { OperationsTask } from "./operations-panels";

export function MeetingMode({ tasks, now, onClose, onSelect }: {
  tasks: OperationsTask[]; now: number; onClose: () => void; onSelect: (id: string) => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const unresolved = tasks.filter((task) => task.status !== "Выполнено" && task.status !== "Снято");
  const overdue = unresolved.filter((task) => task.status === "Просрочено");
  const critical = unresolved.filter((task) => task.priority === "Критический");
  const review = unresolved.filter((task) => task.status === "На проверке");
  const decisions = unresolved.filter((task) => task.status === "На проверке" || task.status === "Требует уточнения");
  const nearDue = unresolved.filter((task) => deadlineDays(task.due, now) >= 0 && deadlineDays(task.due, now) <= 7);
  const stalled = unresolved.filter((task) => {
    const latest = Math.max(0, ...task.history.map((event) => historyTimestamp(event.date)));
    return latest > 0 && now - latest > 14 * 86400000;
  });
  const focus = [...new Map([...critical, ...overdue, ...decisions].map((task) => [task.id, task])).values()].slice(0, 10);
  const comments = tasks.flatMap((task) => task.history.slice(0, 1).map((event) => ({ task, event })))
    .filter(({ event }) => event.text.trim())
    .sort((left, right) => historyTimestamp(right.event.date) - historyTimestamp(left.event.date))
    .slice(0, 6);

  const openTask = (id: string) => { onSelect(id); onClose(); };

  return <section className="meeting-mode" role="dialog" aria-modal="true" aria-labelledby="meeting-title">
    <header className="meeting-header">
      <div><p>РЕЖИМ СОВЕЩАНИЯ · LIVE</p><h1 id="meeting-title">Оперативный разбор поручений</h1></div>
      <button autoFocus onClick={onClose} aria-label="Закрыть режим совещания">Закрыть ×</button>
    </header>
    <div className="meeting-summary" aria-label="Показатели совещания">
      <MeetingMetric label="Просрочено" value={overdue.length} tone="critical" />
      <MeetingMetric label="Критические" value={critical.length} tone="critical" />
      <MeetingMetric label="Без движения" value={stalled.length} tone="warning" />
      <MeetingMetric label="На проверке" value={review.length} tone="info" />
      <MeetingMetric label="Срок ≤ 7 дней" value={nearDue.length} tone="warning" />
      <MeetingMetric label="Нужно решение" value={decisions.length} tone="info" />
    </div>
    <div className="meeting-content">
      <article className="meeting-focus">
        <div className="meeting-section-title"><span>01</span><h2>Приоритеты обсуждения</h2><b>{focus.length}</b></div>
        <div className="meeting-task-list">
          {focus.map((task) => <button key={task.id} onClick={() => openTask(task.id)}>
            <span><small>{task.id} · {task.owner}</small><strong>{task.title}</strong></span>
            <em>{task.priority} · {task.status}</em>
          </button>)}
          {!focus.length && <p>Отклонений для обсуждения нет.</p>}
        </div>
      </article>
      <article className="meeting-comments">
        <div className="meeting-section-title"><span>02</span><h2>Последние комментарии</h2><b>{comments.length}</b></div>
        <div className="meeting-comment-list">
          {comments.map(({ task, event }) => <button key={`${task.id}-${event.date}`} onClick={() => openTask(task.id)}>
            <time>{event.date}</time><strong>{task.title}</strong><p>{event.text}</p>
          </button>)}
          {!comments.length && <p>Комментариев пока нет.</p>}
        </div>
      </article>
    </div>
    <footer><span>ESC — выход</span><span>Выберите поручение, чтобы открыть его рабочую карточку</span></footer>
  </section>;
}

function MeetingMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`meeting-metric ${tone}`}><span>{label}</span><strong>{value}</strong><i /></div>;
}

function deadlineDays(due: string, now: number) {
  return due ? Math.ceil((new Date(`${due}T23:59:59`).getTime() - now) / 86400000) : Number.NaN;
}

function historyTimestamp(value: string) {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})(?:,\s*(\d{2}):(\d{2}))?/);
  return match ? Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0)) : 0;
}
