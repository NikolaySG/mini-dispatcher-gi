type DeadlineState = "safe" | "near" | "urgent" | "overdue" | "none" | "done";

export function getDeadlineState(due: string, status: string, now: number): DeadlineState {
  if (!due) return "none";
  if (status === "Выполнено") return "done";
  const days = Math.ceil((new Date(`${due}T23:59:59`).getTime() - now) / 86400000);
  if (days < 0) return "overdue";
  if (days <= 3) return "urgent";
  if (days <= 7) return "near";
  return "safe";
}

export function DeadlineIndicator({ due, status, now }: { due: string; status: string; now: number }) {
  const state = getDeadlineState(due, status, now);
  const days = due ? Math.ceil((new Date(`${due}T23:59:59`).getTime() - now) / 86400000) : null;
  const date = due ? new Intl.DateTimeFormat("ru-RU").format(new Date(`${due}T12:00:00`)) : "Не определён";
  const label = state === "none" ? "назначить дату"
    : state === "done" ? "срок закрыт"
      : state === "overdue" ? `${Math.abs(days ?? 0)} дн. просрочки`
        : days === 0 ? "сегодня"
          : `${days} дн. осталось`;
  const reserve = state === "safe" ? Math.min(100, Math.max(18, (days ?? 0) / 30 * 100)) : state === "done" ? 100 : state === "none" ? 0 : 100;

  return <span className={`deadline-cell ${state}`} aria-label={`Срок: ${date}. ${label}`}>
    <span className="deadline-date"><i />{date}</span>
    <small>{label}</small>
    <span className="deadline-track" aria-hidden="true"><i style={{ width: `${reserve}%` }} /></span>
  </span>;
}
