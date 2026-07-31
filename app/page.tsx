"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createTaskMailto, downloadTasksCsv } from "./services/task-exchange";

type Status = "Выполнено" | "В работе" | "Просрочено" | "На проверке" | "Требует уточнения" | "Снято";
type Priority = "Критический" | "Высокий" | "Средний" | "Низкий";
type HistoryEvent = { date: string; title: string; text: string };
type Task = {
  id: string; title: string; description: string; owner: string; ownerEmail: string;
  status: Status; priority: Priority; due: string; created: string; author: string;
  project: string; history: HistoryEvent[];
};
type TaskDraft = Omit<Task, "id" | "created" | "history">;

const statuses: Status[] = ["В работе", "На проверке", "Требует уточнения", "Просрочено", "Выполнено", "Снято"];
const priorities: Priority[] = ["Критический", "Высокий", "Средний", "Низкий"];
const runtimeNow = Date.now();
const statusColors: Record<Status, string> = {
  "Выполнено": "#37e6a1", "В работе": "#3cc8ff", "Просрочено": "#ff5263",
  "На проверке": "#ffc857", "Требует уточнения": "#b892ff", "Снято": "#718096",
};
const statusClass: Record<Status, string> = {
  "Выполнено": "done", "В работе": "active", "Просрочено": "overdue",
  "На проверке": "review", "Требует уточнения": "clarify", "Снято": "removed",
};
const emptyDraft: TaskDraft = {
  title: "", description: "", owner: "", ownerEmail: "", status: "В работе",
  priority: "Средний", due: new Date().toISOString().slice(0, 10), author: "Главный инженер", project: "",
};

const formatDate = (date: string) =>
  date ? new Intl.DateTimeFormat("ru-RU").format(new Date(`${date}T12:00:00`)) : "Не определён";

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [owner, setOwner] = useState("Все");
  const [status, setStatus] = useState("Все");
  const [priority, setPriority] = useState("Все");
  const [due, setDue] = useState("Все");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [toast, setToast] = useState("");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  useEffect(() => {
    fetch("/api/tasks")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setTasks(payload.tasks);
        setSelectedId(payload.tasks[0]?.id ?? "");
      })
      .catch((error) => notify(error instanceof Error ? error.message : "Не удалось загрузить данные"))
      .finally(() => setLoading(false));
  }, []);

  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0];
  const activeTasks = tasks.filter((task) => task.status !== "Снято");
  const owners = [...new Set(tasks.map((task) => task.owner))].sort();

  const filtered = useMemo(() => tasks.filter((task) => {
    const diff = task.due ? Math.ceil((new Date(`${task.due}T12:00:00`).getTime() - runtimeNow) / 86400000) : Number.NaN;
    const dueMatch = due === "Все" || (due === "Без срока" && !task.due) || (due === "Просрочено" && diff < 0) || (due === "7 дней" && diff >= 0 && diff <= 7) || (due === "Позже" && diff > 7);
    const q = query.trim().toLowerCase();
    return (owner === "Все" || task.owner === owner)
      && (status === "Все" || task.status === status)
      && (priority === "Все" || task.priority === priority)
      && dueMatch
      && (!q || `${task.id} ${task.title} ${task.description} ${task.project}`.toLowerCase().includes(q));
  }), [tasks, owner, status, priority, due, query]);

  const statusCounts = statuses.map((label) => ({
    label, value: tasks.filter((task) => task.status === label).length,
  }));
  const ownerCounts = [...activeTasks.reduce((counts, task) => {
    for (const surname of executorSurnames(task.owner)) {
      counts.set(surname, (counts.get(surname) ?? 0) + 1);
    }
    return counts;
  }, new Map<string, number>())]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, "ru"));
  const maxOwner = Math.max(1, ...ownerCounts.map((item) => item.value));
  const attentionCount = activeTasks.filter((task) =>
    task.status === "Просрочено" || task.status === "Требует уточнения"
  ).length;
  const attentionShare = activeTasks.length
    ? Math.round(attentionCount / activeTasks.length * 100)
    : 0;
  const attentionTone = attentionCount === 0 ? "#37e6a1" : attentionShare > 50 ? "#ff5263" : "#ffc857";
  const donutStops = makeDonut(statusCounts, Math.max(1, tasks.length));

  const metrics = [
    ["Всего", activeTasks.length, "neutral", "в активном контуре"],
    ["Выполнено", statusCounts.find((item) => item.label === "Выполнено")?.value ?? 0, "green", "закрыто в журнале"],
    ["В работе", statusCounts.find((item) => item.label === "В работе")?.value ?? 0, "blue", "требуют внимания"],
    ["Просрочено", statusCounts.find((item) => item.label === "Просрочено")?.value ?? 0, "red", "критическая зона"],
    ["На проверке", statusCounts.find((item) => item.label === "На проверке")?.value ?? 0, "amber", "ожидают решения"],
    ["Уточнить", statusCounts.find((item) => item.label === "Требует уточнения")?.value ?? 0, "purple", "есть вопросы"],
  ] as const;

  const openCreate = () => {
    setDraft({ ...emptyDraft, due: new Date().toISOString().slice(0, 10) });
    setModal("create");
  };

  const openEdit = () => {
    if (!selected) return;
    setDraft({
      title: selected.title,
      description: selected.description,
      owner: selected.owner,
      ownerEmail: selected.ownerEmail,
      status: selected.status,
      priority: selected.priority,
      due: selected.due,
      author: selected.author,
      project: selected.project,
    });
    setModal("edit");
  };

  const saveTask = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const normalized = { ...draft };
      if (normalized.due < today && normalized.status === "В работе") normalized.status = "Просрочено";
      if (normalized.due >= today && normalized.status === "Просрочено") normalized.status = "В работе";
      const response = await fetch("/api/tasks", {
        method: modal === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal === "create" ? normalized : { ...normalized, id: selected?.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setTasks((current) => modal === "create"
        ? [payload.task, ...current]
        : current.map((task) => task.id === payload.task.id ? payload.task : task));
      setSelectedId(payload.task.id);
      setModal(null);
      notify(modal === "create" ? "Поручение создано" : "Изменения сохранены");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  const quickStatus = async (nextStatus: Status) => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, status: nextStatus }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setTasks((current) => current.map((task) => task.id === selected.id ? payload.task : task));
      notify(nextStatus === "Выполнено" ? "Поручение выполнено" : nextStatus === "Снято" ? "Поручение снято" : "Статус обновлён");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось изменить статус");
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = async () => {
    if (!selected || !window.confirm(`Удалить ${selected.id}? История тоже исчезнет. Бюрократия смертна, но обычно не настолько.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setTasks((current) => current.filter((task) => task.id !== selected.id));
      setSelectedId(tasks.find((task) => task.id !== selected.id)?.id ?? "");
      notify("Поручение удалено");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-a" /><div className="ambient ambient-b" />
      <div className="hud-frame" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="hud-side-rail" aria-hidden="true">
        <span>GI / AI</span><b>01</b><i /><b>02</b><i /><b>03</b><i /><em>SYSTEM ONLINE</em>
      </div>
      <header className="command-header">
        <div className="brand">
          <div className="brand-orbit"><span>ГИ</span></div>
          <div><p className="kicker">ИНТЕЛЛЕКТУАЛЬНЫЙ КОМАНДНЫЙ КОНТУР</p><h1>Диспетчерская <em>/ AI</em></h1></div>
        </div>
        <div className="header-center">
          <span className="live-pulse" /><span>ASSISTANT CORE ONLINE</span>
          <b>{activeTasks.length}</b><small>ПОРУЧЕНИЙ В КОНТУРЕ</small>
        </div>
        <div className="header-actions">
          <button className="ghost-button" onClick={() => downloadTasksCsv(filtered, "filtr")}>Экспорт CSV</button>
          <button className="create-button" onClick={openCreate}><span>＋</span> Новое поручение</button>
        </div>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="signal-label">ДОБРЫЙ ВЕЧЕР, НИКОЛАЙ · ОПЕРАТИВНАЯ КАРТИНА ГОТОВА</p>
          <div className="assistant-brief">
            <span className="assistant-wave"><i /><i /><i /><i /><i /><i /><i /></span>
            <div><small>СИСТЕМНЫЙ БРИФИНГ</small><strong>{statusCounts.find((item) => item.label === "Просрочено")?.value ?? 0} просрочено · {statusCounts.find((item) => item.label === "Требует уточнения")?.value ?? 0} уточнить · {attentionCount} в фокусе</strong></div>
            <b>LIVE</b>
          </div>
        </div>
        <div className="completion-core">
          <div className="core-ring" style={{ "--progress": `${attentionShare * 3.6}deg`, "--core-tone": attentionTone } as React.CSSProperties}>
            <span className="core-orbit orbit-one" /><span className="core-orbit orbit-two" /><i className="core-node node-a" /><i className="core-node node-b" />
            <div><strong>{attentionCount}</strong><span>требуют решения</span></div>
          </div>
          <div className="core-caption"><i style={{ background: attentionTone, boxShadow: `0 0 10px ${attentionTone}` }} /><span>Контур внимания</span><b style={{ color: attentionTone }}>{attentionCount === 0 ? "NORMAL" : attentionShare <= 25 ? "STABLE" : attentionShare <= 50 ? "MONITOR" : "ALERT"}</b></div>
        </div>
        <div className="risk-radar">
          <div className="radar-grid"><span className="radar-sweep" /><i className="blip b1" /><i className="blip b2" /><i className="blip b3" /></div>
          <div><span>TACTICAL RISK SCAN</span><strong>{statusCounts.find((item) => item.label === "Просрочено")?.value ?? 0}</strong><small>просрочено</small></div>
        </div>
      </section>

      <section className="metric-deck" aria-label="Сводные показатели">
        {metrics.map(([label, value, tone, caption], index) => (
          <button className={`metric-tile ${tone}`} key={label} onClick={() => setStatus(label === "Уточнить" ? "Требует уточнения" : label === "Всего" ? "Все" : label)}>
            <span className="metric-index">0{index + 1}</span><span className="metric-label">{label}</span>
            <strong>{String(value).padStart(2, "0")}</strong><small>{caption}</small><i className="metric-line" />
          </button>
        ))}
      </section>

      <section className="control-surface">
        <div className="surface-header">
          <div><p className="kicker">РЕЕСТР / LIVE DATA</p><h2>Поручения</h2></div>
          <div className="surface-meta"><span>{filtered.length} показано</span><span>{tasks.filter((task) => task.status === "Снято").length} снято</span></div>
        </div>
        <div className="filter-rail">
          <label className="search-control"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по ID, объекту или тексту" /></label>
          <Filter value={owner} onChange={setOwner} options={owners} label="Ответственный" />
          <Filter value={status} onChange={setStatus} options={statuses} label="Статус" />
          <Filter value={priority} onChange={setPriority} options={priorities} label="Приоритет" />
          <Filter value={due} onChange={setDue} options={["Без срока", "Просрочено", "7 дней", "Позже"]} label="Срок" />
          <button className="clear-filters" onClick={() => { setOwner("Все"); setStatus("Все"); setPriority("Все"); setDue("Все"); setQuery(""); }}>Сброс</button>
        </div>

        <div className="registry-grid">
          <div className="task-list">
            <div className="task-list-head"><span>ПОРУЧЕНИЕ</span><span>ОТВЕТСТВЕННЫЙ</span><span>СРОК</span><span>СТАТУС</span></div>
            {loading && <div className="loading-state"><i /><span>Поднимаем оперативную картину…</span></div>}
            {!loading && filtered.map((task) => (
              <button className={`task-row ${selected?.id === task.id ? "selected" : ""}`} key={task.id} onClick={() => setSelectedId(task.id)}>
                <span className="task-main"><small>{task.id} · {task.project}</small><strong>{task.title}</strong><em className={`priority-dot ${task.priority.toLowerCase()}`}>{task.priority}</em></span>
                <span className="owner-cell"><i>{task.owner.slice(-1)}</i><b>{task.owner}</b></span>
                <span className={`due-cell ${task.status === "Просрочено" ? "late" : ""}`}><strong>{formatDate(task.due)}</strong><small>{daysLabel(task.due)}</small></span>
                <span><StatusBadge status={task.status} /></span>
              </button>
            ))}
            {!loading && !filtered.length && <div className="empty-state">Сигналов нет. Либо всё хорошо, либо фильтры перестарались.</div>}
          </div>

          <aside className="task-inspector">
            {selected ? <>
              <div className="inspector-head">
                <div><p className="kicker">{selected.id}</p><h3>{selected.title}</h3></div>
                <StatusBadge status={selected.status} />
              </div>
              <p className="task-description">{selected.description || "Описание не заполнено."}</p>
              <div className="inspector-actions">
                <button className="action primary-action" onClick={openEdit}>✎ Изменить</button>
                <button className="action success-action" disabled={busy || selected.status === "Выполнено"} onClick={() => quickStatus("Выполнено")}>✓ Выполнено</button>
                <button className="action remove-action" disabled={busy || selected.status === "Снято"} onClick={() => quickStatus("Снято")}>⊘ Снять</button>
                <button className="action delete-action" disabled={busy} onClick={deleteTask}>⌫ Удалить</button>
              </div>
              <div className="detail-matrix">
                <div><span>Ответственный</span><strong>{selected.owner}</strong></div>
                <div><span>Срок</span><strong>{formatDate(selected.due)}</strong></div>
                <div><span>Приоритет</span><strong>{selected.priority}</strong></div>
                <div><span>Объект</span><strong>{selected.project}</strong></div>
                <div><span>Постановщик</span><strong>{selected.author}</strong></div>
                <div><span>Создано</span><strong>{formatDate(selected.created)}</strong></div>
              </div>
              <a className="mail-link" href={createTaskMailto(selected)}>↗ Сформировать письмо исполнителю</a>
              <div className="history-block">
                <div className="history-title"><span>ИСТОРИЯ</span><b>{selected.history.length}</b></div>
                {selected.history.map((event, index) => (
                  <div className="history-event" key={`${event.date}-${index}`}><i className={index === 0 ? "current" : ""} /><div><time>{event.date}</time><strong>{event.title}</strong><p>{event.text}</p></div></div>
                ))}
              </div>
            </> : <div className="empty-inspector">Выберите поручение</div>}
          </aside>
        </div>
      </section>

      <section className="analytics-deck">
        <article className="analytics-card status-analytics">
          <div className="analytics-head"><div><p className="kicker">СОСТОЯНИЕ СИСТЕМЫ</p><h3>Статусы</h3></div><span>LIVE</span></div>
          <div className="donut-layout">
            <div className="donut" style={{ background: `conic-gradient(${donutStops})` }}><div><strong>{tasks.length}</strong><span>ВСЕГО</span></div></div>
            <div className="legend">{statusCounts.map((item) => <button key={item.label} onClick={() => setStatus(item.label)}><i style={{ background: statusColors[item.label] }} /><span>{item.label}</span><strong>{item.value}</strong></button>)}</div>
          </div>
        </article>
        <article className="analytics-card load-analytics">
          <div className="analytics-head"><div><p className="kicker">РАСПРЕДЕЛЕНИЕ НАГРУЗКИ</p><h3>Исполнители</h3></div><span>ACTIVE</span></div>
          <div className="bar-chart">{ownerCounts.map((item, index) => <div className="bar-row" key={item.label}><span>0{index + 1}</span><b>{item.label}</b><div><i style={{ width: `${item.value / maxOwner * 100}%` }} /></div><strong>{item.value}</strong></div>)}</div>
        </article>
      </section>

      <footer><span>MINI DISPATCHER / GI</span><span>Данные хранятся в защищённой базе · изменения сохраняются автоматически</span></footer>
      {toast && <div className="toast"><i />{toast}</div>}
      {modal && <TaskModal mode={modal} draft={draft} setDraft={setDraft} onClose={() => setModal(null)} onSubmit={saveTask} busy={busy} />}
    </main>
  );
}

function TaskModal({ mode, draft, setDraft, onClose, onSubmit, busy }: {
  mode: "create" | "edit"; draft: TaskDraft; setDraft: (draft: TaskDraft) => void;
  onClose: () => void; onSubmit: (event: FormEvent) => void; busy: boolean;
}) {
  const field = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft({ ...draft, [key]: value });
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="task-modal" onSubmit={onSubmit}>
        <div className="modal-head"><div><p className="kicker">УПРАВЛЕНИЕ ПОРУЧЕНИЕМ</p><h2>{mode === "create" ? "Новое поручение" : "Редактирование"}</h2></div><button type="button" onClick={onClose}>×</button></div>
        <div className="form-grid">
          <label className="wide"><span>Название *</span><input required autoFocus value={draft.title} onChange={(e) => field("title", e.target.value)} placeholder="Что необходимо сделать" /></label>
          <label><span>Ответственный *</span><input required value={draft.owner} onChange={(e) => field("owner", e.target.value)} placeholder="ФИО или роль" /></label>
          <label><span>Email</span><input type="email" value={draft.ownerEmail} onChange={(e) => field("ownerEmail", e.target.value)} placeholder="executor@company.ru" /></label>
          <label><span>Срок *</span><input required type="date" value={draft.due} onChange={(e) => field("due", e.target.value)} /></label>
          <label><span>Статус</span><select value={draft.status} onChange={(e) => field("status", e.target.value as Status)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Приоритет</span><select value={draft.priority} onChange={(e) => field("priority", e.target.value as Priority)}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Объект / проект</span><input value={draft.project} onChange={(e) => field("project", e.target.value)} placeholder="Объект 1" /></label>
          <label className="wide"><span>Постановщик</span><input value={draft.author} onChange={(e) => field("author", e.target.value)} /></label>
          <label className="wide"><span>Описание</span><textarea value={draft.description} onChange={(e) => field("description", e.target.value)} placeholder="Условия, ожидаемый результат, необходимые материалы" /></label>
        </div>
        <div className="modal-actions"><button type="button" className="cancel-button" onClick={onClose}>Отмена</button><button disabled={busy} className="save-button">{busy ? "Сохраняем…" : mode === "create" ? "Создать поручение" : "Сохранить изменения"}</button></div>
      </form>
    </div>
  );
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="select-control"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option>Все</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge ${statusClass[status]}`}><i />{status}</span>;
}

function daysLabel(date: string) {
  if (!date) return "назначить дату";
  const diff = Math.ceil((new Date(`${date}T23:59:59`).getTime() - runtimeNow) / 86400000);
  if (diff < 0) return `${Math.abs(diff)} дн. просрочки`;
  if (diff === 0) return "сегодня";
  return `${diff} дн. осталось`;
}

function executorSurnames(owner: string) {
  return [...new Set(owner
    .split(/[;,]/)
    .map((person) => person.replace(/\([^)]*\)/g, "").trim())
    .filter((person) => person && !person.includes("/") && !person.startsWith("Ответственный"))
    .map((person) => person.split(/\s+/)[0])
    .filter(Boolean))];
}

function makeDonut(items: { label: Status; value: number }[], total: number) {
  let start = 0;
  return items.map((item) => {
    const end = start + item.value / total * 100;
    const segment = `${statusColors[item.label]} ${start}% ${end}%`;
    start = end;
    return segment;
  }).join(", ");
}
