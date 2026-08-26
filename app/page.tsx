"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CommandCore } from "./components/command-core";
import { DeadlineIndicator, getDeadlineState } from "./components/deadline-indicator";
import { OperationsPanels } from "./components/operations-panels";
import { MeetingMode } from "./components/meeting-mode";
import { KarmaDashboard } from "./components/karma-dashboard";
import { AnalogCalendarClock } from "./components/analog-calendar-clock";
import { createTaskMailto, createTasksMailto, downloadTasksCsv, downloadTasksXlsx } from "./services/task-exchange";
import { formatStoredDate, getDeadlineTransfers } from "./services/deadline-history";

type Status = "Выполнено" | "В работе" | "Просрочено" | "На проверке" | "Требует уточнения" | "Снято";
type Priority = "Критический" | "Высокий" | "Средний" | "Низкий";
type HistoryEvent = { date: string; title: string; text: string };
type Task = {
  id: string; title: string; description: string; owner: string; ownerEmail: string;
  status: Status; priority: Priority; due: string; created: string; author: string;
  project: string; karmaExcluded: boolean; completedAt: string; history: HistoryEvent[];
};
type TaskDraft = Omit<Task, "id" | "created" | "history">;
type Responsible = { id: string; name: string; position: string; email: string; phone: string; updatedAt?: string };
type ResponsibleDraft = Omit<Responsible, "id" | "updatedAt">;
type GoogleSyncInfo = { state: "online" | "pending" | "unavailable"; pending: number; lastSync: string | null; lastError: string | null };

const statuses: Status[] = ["В работе", "На проверке", "Требует уточнения", "Просрочено", "Выполнено", "Снято"];
const priorities: Priority[] = ["Критический", "Высокий", "Средний", "Низкий"];
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
  priority: "Средний", due: todaySaratov(), author: "Главный инженер", project: "", karmaExcluded: false, completedAt: "",
};
const emptyResponsibleDraft: ResponsibleDraft = { name: "", position: "", email: "", phone: "" };

const formatDate = (date: string) =>
  date ? new Intl.DateTimeFormat("ru-RU").format(new Date(`${date}T12:00:00`)) : "Не определён";

function todaySaratov() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Saratov", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [owner, setOwner] = useState("Все");
  const [status, setStatus] = useState("Все");
  const [priority, setPriority] = useState("Все");
  const [due, setDue] = useState("Все");
  const [query, setQuery] = useState("");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [toast, setToast] = useState("");
  const [runtimeNow, setRuntimeNow] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [connectionState, setConnectionState] = useState<"loading" | "online" | "error">("loading");
  const [googleSync, setGoogleSync] = useState<GoogleSyncInfo>({ state: "unavailable", pending: 0, lastSync: null, lastError: null });
  const [syncBusy, setSyncBusy] = useState(false);
  const [adminMode, setAdminMode] = useState(true);
  const [meetingMode, setMeetingMode] = useState(false);
  const [highlightedId, setHighlightedId] = useState("");
  const [view, setView] = useState<"tasks" | "responsibles" | "karma">("tasks");
  const [responsibles, setResponsibles] = useState<Responsible[]>([]);
  const [responsibleModal, setResponsibleModal] = useState<"create" | "edit" | null>(null);
  const [responsibleDraft, setResponsibleDraft] = useState<ResponsibleDraft>(emptyResponsibleDraft);
  const [selectedResponsibleId, setSelectedResponsibleId] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [completionModal, setCompletionModal] = useState(false);
  const [completionDate, setCompletionDate] = useState("");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const prepareMailing = (mailTasks: Task[]) => {
    if (!mailTasks.length) return;
    const fileName = downloadTasksXlsx(mailTasks);
    const draft = mailTasks.length === 1
      ? createTaskMailto(mailTasks[0], fileName)
      : createTasksMailto(mailTasks, fileName);
    notify(`Excel-файл «${fileName}» скачан. Прикрепите его к открытому черновику письма.`);
    window.setTimeout(() => window.location.assign(draft), 180);
  };

  const highlightTask = (id: string) => {
    setHighlightedId(id);
    window.setTimeout(() => setHighlightedId(""), 1800);
  };

  useEffect(() => {
    fetch("/api/tasks")
      .then(async (taskResponse) => {
        const taskPayload = await taskResponse.json();
        if (!taskResponse.ok) throw new Error(taskPayload.error);
        const responsibleResponse = await fetch("/api/responsibles");
        const responsiblePayload = await responsibleResponse.json();
        if (!responsibleResponse.ok) throw new Error(responsiblePayload.error);
        setTasks(taskPayload.tasks);
        setResponsibles(responsiblePayload.responsibles);
        setSelectedId(taskPayload.tasks[0]?.id ?? "");
        setSelectedResponsibleId(responsiblePayload.responsibles[0]?.id ?? "");
        setLastSync(new Date());
        setConnectionState("online");
        setGoogleSync(normalizeGoogleSync(taskPayload.googleSync));
      })
      .catch((error) => {
        setConnectionState("error");
        notify(error instanceof Error ? error.message : "Не удалось загрузить данные");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const updateRuntimeNow = () => {
      const now = new Date();
      setRuntimeNow(now.getTime());
    };
    const initial = window.setTimeout(updateRuntimeNow, 0);
    const timer = window.setInterval(updateRuntimeNow, 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const refreshSync = () => fetch("/api/sync")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (payload) setGoogleSync(normalizeGoogleSync(payload)); })
      .catch(() => undefined);
    const timer = window.setInterval(refreshSync, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const syncNow = async () => {
    setSyncBusy(true);
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const next = normalizeGoogleSync(payload);
      setGoogleSync(next);
      setLastSync(new Date());
      notify(next.state === "online" ? "Google Sheets синхронизирован" : "Google Sheets недоступен · изменения сохранены в очереди");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось синхронизировать Google Sheets");
    } finally {
      setSyncBusy(false);
    }
  };

  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0];
  const activeTasks = tasks.filter((task) => task.status !== "Снято");
  const owners = [...new Set(tasks.flatMap((task) => splitPeople(task.owner)))].sort((left, right) => left.localeCompare(right, "ru"));

  const filtered = useMemo(() => tasks.filter((task) => {
    const diff = task.due ? Math.ceil((new Date(`${task.due}T12:00:00`).getTime() - runtimeNow) / 86400000) : Number.NaN;
    const dueMatch = due === "Все" || (due === "Без срока" && !task.due) || (due === "Просрочено" && diff < 0) || (due === "7 дней" && diff >= 0 && diff <= 7) || (due === "Позже" && diff > 7);
    const q = query.trim().toLowerCase();
    return (owner === "Все" || splitPeople(task.owner).includes(owner))
      && (status === "Все" || task.status === status)
      && (priority === "Все" || task.priority === priority)
      && dueMatch
      && (!hideCompleted || task.status !== "Выполнено")
      && (!q || `${task.id} ${task.title} ${task.description} ${task.project}`.toLowerCase().includes(q));
  }), [tasks, owner, status, priority, due, query, hideCompleted, runtimeNow]);
  const selectedTasks = tasks.filter((task) => selectedTaskIds.has(task.id));
  const selectedRecipients = [...new Set(selectedTasks.flatMap((task) => task.ownerEmail
    .split(/[;,]/).map((item) => item.trim()).filter(Boolean)))];
  const allFilteredSelected = filtered.length > 0 && filtered.every((task) => selectedTaskIds.has(task.id));

  const toggleTaskSelection = (id: string) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleFilteredSelection = () => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filtered.forEach((task) => next.delete(task.id));
      else filtered.forEach((task) => next.add(task.id));
      return next;
    });
  };

  const toggleCompletedVisibility = () => {
    const next = !hideCompleted;
    setHideCompleted(next);
    if (next && selected?.status === "Выполнено") {
      setSelectedId(filtered.find((task) => task.status !== "Выполнено")?.id ?? "");
    }
  };

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
  const selectOwnerBySurname = (surname: string) => {
    const matchedOwner = owners.find((person) => executorSurnames(person).includes(surname));
    if (!matchedOwner) return;

    setOwner(matchedOwner);
    setStatus("Все");
    setPriority("Все");
    setDue("Все");
    setQuery("");

    const firstTask = tasks.find((task) => splitPeople(task.owner).includes(matchedOwner));
    if (firstTask) setSelectedId(firstTask.id);

    window.requestAnimationFrame(() => {
      document.getElementById("task-registry")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const attentionCount = activeTasks.filter((task) =>
    task.status === "Просрочено" || task.status === "Требует уточнения"
  ).length;
  const attentionShare = activeTasks.length
    ? Math.round(attentionCount / activeTasks.length * 100)
    : 0;
  const attentionTone = attentionCount === 0 ? "#37e6a1" : attentionShare > 50 ? "#ff5263" : "#ffc857";
  const criticalCount = activeTasks.filter((task) => task.priority === "Критический" && task.status !== "Выполнено").length;
  const week = getCurrentWeek(runtimeNow);
  const openTasks = tasks.filter((task) => task.status !== "Выполнено" && task.status !== "Снято");
  const weekDueCount = openTasks.filter((task) => task.due && task.due >= week.today && task.due <= week.end).length;
  const overdueCount = openTasks.filter((task) => task.due && task.due < week.today).length;
  const reviewCount = openTasks.filter((task) => task.status === "На проверке" || task.status === "Требует уточнения").length;
  const nearDueCount = activeTasks.filter((task) => {
    if (!task.due || task.status === "Выполнено") return false;
    const days = Math.ceil((new Date(`${task.due}T23:59:59`).getTime() - runtimeNow) / 86400000);
    return days >= 0 && days <= 7;
  }).length;
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
    setDraft({ ...emptyDraft, due: todaySaratov() });
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
      karmaExcluded: selected.karmaExcluded,
      completedAt: selected.completedAt ?? "",
    });
    setModal("edit");
  };

  const openCompletion = () => {
    if (!selected) return;
    setCompletionDate(selected.completedAt || todaySaratov());
    setCompletionModal(true);
  };

  const openResponsibleCreate = () => {
    setResponsibleDraft(emptyResponsibleDraft);
    setResponsibleModal("create");
  };

  const openResponsibleEdit = (responsible: Responsible) => {
    setSelectedResponsibleId(responsible.id);
    setResponsibleDraft({ name: responsible.name, position: responsible.position, email: responsible.email, phone: responsible.phone });
    setResponsibleModal("edit");
  };

  const saveResponsible = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/responsibles", {
        method: responsibleModal === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responsibleModal === "create" ? responsibleDraft : { ...responsibleDraft, id: selectedResponsibleId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setResponsibles((current) => (responsibleModal === "create"
        ? [...current, payload.responsible]
        : current.map((item) => item.id === payload.responsible.id ? payload.responsible : item))
        .sort((left, right) => left.name.localeCompare(right.name, "ru")));
      if (responsibleModal === "edit") {
        const taskResponse = await fetch("/api/tasks");
        const taskPayload = await taskResponse.json();
        if (!taskResponse.ok) throw new Error(taskPayload.error);
        setTasks(taskPayload.tasks);
        setGoogleSync(normalizeGoogleSync(taskPayload.googleSync));
        setLastSync(new Date());
      }
      setSelectedResponsibleId(payload.responsible.id);
      setResponsibleModal(null);
      notify(responsibleModal === "create" ? "Ответственный добавлен в справочник" : "Данные ответственного обновлены");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сохранить справочник");
    } finally {
      setBusy(false);
    }
  };

  const deleteResponsible = async (responsible: Responsible) => {
    const taskCount = tasks.filter((task) => splitPeople(task.owner).includes(responsible.name)).length;
    const assignmentNote = taskCount ? `\n\nВ ${taskCount} поручениях ФИО останется для сохранения истории.` : "";
    if (!window.confirm(`Удалить ${responsible.name} из справочника?${assignmentNote}`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/responsibles?id=${encodeURIComponent(responsible.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setResponsibles((current) => current.filter((item) => item.id !== responsible.id));
      if (selectedResponsibleId === responsible.id) setSelectedResponsibleId("");
      notify(payload.assignedTaskCount
        ? `Удалено из справочника. Назначения в ${payload.assignedTaskCount} поручениях сохранены`
        : "Ответственный удалён из справочника");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось удалить ответственного");
    } finally {
      setBusy(false);
    }
  };

  const saveTask = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const today = todaySaratov();
      const normalized = { ...draft };
      if (normalized.status === "Выполнено" && !normalized.completedAt) throw new Error("Укажите дату фактического исполнения");
      if (normalized.status === "Выполнено" && normalized.completedAt > today) throw new Error("Дата исполнения не может быть будущей");
      if (normalized.status !== "Выполнено") normalized.completedAt = "";
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
      setLastSync(new Date());
      const sync = normalizeGoogleSync(payload.googleSync);
      setGoogleSync(sync);
      highlightTask(payload.task.id);
      setModal(null);
      notify(sync.state === "pending"
        ? "Сохранено в базе · Google Sheets синхронизируется"
        : sync.state === "online" ? "Сохранено в базе и Google Sheets" : "Сохранено в базе · Google Sheets временно недоступен");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  const quickStatus = async (nextStatus: Status, completedAt = "") => {
    if (!selected) return false;
    setBusy(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, status: nextStatus, completedAt }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setTasks((current) => current.map((task) => task.id === selected.id ? payload.task : task));
      setLastSync(new Date());
      const sync = normalizeGoogleSync(payload.googleSync);
      setGoogleSync(sync);
      highlightTask(selected.id);
      notify(sync.state === "pending" ? "Статус сохранён · Google Sheets синхронизируется" : sync.state === "online"
        ? nextStatus === "Выполнено" ? "Поручение выполнено · Google Sheets обновлён" : nextStatus === "Снято" ? "Поручение снято · Google Sheets обновлён" : "Статус обновлён в Google Sheets"
        : "Статус сохранён в базе · Google Sheets временно недоступен");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось изменить статус");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const completeTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!completionDate) return notify("Укажите дату фактического исполнения");
    if (completionDate > todaySaratov()) return notify("Дата исполнения не может быть будущей");
    if (await quickStatus("Выполнено", completionDate)) setCompletionModal(false);
  };

  const toggleKarma = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, karmaExcluded: !selected.karmaExcluded }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setTasks((current) => current.map((task) => task.id === selected.id ? payload.task : task));
      setLastSync(new Date());
      setGoogleSync(normalizeGoogleSync(payload.googleSync));
      notify(payload.task.karmaExcluded ? "Поручение исключено из расчёта кармы" : "Поручение возвращено в расчёт кармы");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось изменить расчёт кармы");
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
      setLastSync(new Date());
      const sync = normalizeGoogleSync(payload.googleSync);
      setGoogleSync(sync);
      notify(sync.state === "pending" ? "Удалено из базы · Google Sheets синхронизируется" : sync.state === "online" ? "Поручение удалено из базы и Google Sheets" : "Удалено из базы · Google Sheets временно недоступен");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      {meetingMode && <MeetingMode tasks={activeTasks} now={runtimeNow} onClose={() => setMeetingMode(false)} onSelect={setSelectedId} />}
      <header className="command-header">
        <div className="brand">
          <div className="brand-mark"><span>ГИ</span></div>
          <div><p className="kicker">WorkSGA · КОНТУР ГЛАВНОГО ИНЖЕНЕРА</p><h1>Мини-диспетчерская</h1></div>
        </div>
        <div className="header-center">
          <span className="live-pulse" /><span>СИСТЕМА РАБОТАЕТ</span>
          <b>{activeTasks.length}</b><small>АКТИВНЫХ ПОРУЧЕНИЙ</small>
        </div>
        <div className="header-actions">
          <button className="ghost-button" onClick={() => downloadTasksCsv(filtered, "filtr")}>Экспорт CSV</button>
          <button className="create-button" disabled={!adminMode} onClick={openCreate}><span>＋</span> Новое поручение</button>
        </div>
      </header>

      <section className="system-status-bar" aria-label="Состояние диспетчерской" data-connection={connectionState}>
        <div className={`system-status ${connectionState}`}><i /><span>Система</span><strong>{connectionState === "online" ? "Работает" : connectionState === "loading" ? "Подключение" : "Ошибка связи"}</strong></div>
        <AnalogCalendarClock />
        <div><span>Последняя синхронизация</span><strong>{lastSync ? formatSystemTime(lastSync) : "Ожидание данных"}</strong></div>
        <div><span>Источник</span><strong>{connectionState === "online" ? googleSync.state === "online" ? "D1 + Google Sheets" : googleSync.state === "pending" ? `D1 · Sheets: ${googleSync.pending} в очереди` : "D1 · Sheets недоступен" : "D1 · проверка"}</strong></div>
        <button className={`sync-button ${googleSync.state}`} disabled={syncBusy} onClick={syncNow} title={googleSync.lastError ?? "Принудительная полная синхронизация с Google Sheets"}><i />{syncBusy ? "Синхронизация…" : googleSync.state === "pending" ? `Синхронизировать (${googleSync.pending})` : "Синхронизировать"}</button>
        <button className="meeting-button" onClick={() => setMeetingMode(true)}><i />Совещание</button>
        <button className={adminMode ? "admin active" : "admin"} onClick={() => setAdminMode((current) => !current)} aria-pressed={adminMode}>
          <i />{adminMode ? "Администратор" : "Просмотр"}
        </button>
      </section>

      <nav className="workspace-tabs" aria-label="Разделы диспетчерской">
        <button className={view === "tasks" ? "active" : ""} onClick={() => setView("tasks")}><span>01</span>Поручения</button>
        <button className={view === "responsibles" ? "active" : ""} onClick={() => setView("responsibles")}><span>02</span>Справочник ответственных <b>{responsibles.length}</b></button>
        <button className={view === "karma" ? "active karma-tab" : "karma-tab"} onClick={() => setView("karma")}><span>03</span>Карма <b>{tasks.filter((task) => !task.karmaExcluded && task.status !== "Снято").length}</b></button>
      </nav>

      {view === "tasks" ? <>

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="signal-label">ОПЕРАТИВНАЯ КАРТИНА</p>
          <h2>Контроль поручений<br /><em>главного инженера</em></h2>
          <p>Сроки, ответственные, отклонения и последние изменения — в одном рабочем контуре.</p>
          <div className="assistant-brief">
            <span className="brief-indicator"><i /></span>
            <div><small>ТЕКУЩАЯ НЕДЕЛЯ · {runtimeNow ? week.label : "расчёт периода"}</small><strong>сроков до воскресенья: {weekDueCount} · просрочено: {overdueCount} · требуют решения: {reviewCount}</strong></div>
            <b>LIVE</b>
          </div>
        </div>
        <CommandCore attentionCount={attentionCount} attentionShare={attentionShare} criticalCount={criticalCount} nearDueCount={nearDueCount} tone={attentionTone} />
      </section>

      <section className="metric-deck" aria-label="Сводные показатели">
        {metrics.map(([label, value, tone, caption], index) => (
          <button className={`metric-tile ${tone}`} key={label} onClick={() => setStatus(label === "Уточнить" ? "Требует уточнения" : label === "Всего" ? "Все" : label)}>
            <span className="metric-index">0{index + 1}</span><span className="metric-label">{label}</span><span className="metric-state"><i />{metricState(label)}</span>
            <strong>{String(value).padStart(2, "0")}</strong><small>{caption}</small><i className="metric-line" />
          </button>
        ))}
      </section>

      <section className="control-surface" id="task-registry">
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
        <div className="selection-toolbar" aria-label="Работа с выборкой поручений">
          <button className={hideCompleted ? "hide-completed active" : "hide-completed"} aria-pressed={hideCompleted} onClick={toggleCompletedVisibility}>
            {hideCompleted ? "Показать выполненные" : "Скрыть выполненные"}
          </button>
          <button className="selection-toggle" onClick={toggleFilteredSelection} disabled={!filtered.length}>
            {allFilteredSelected ? "Снять выбор с показанных" : "Выбрать все показанные"}
          </button>
          <span><strong>{selectedTasks.length}</strong> выбрано · <strong>{selectedRecipients.length}</strong> адресатов</span>
          <button className={selectedTasks.length && selectedRecipients.length ? "selection-mail" : "selection-mail-disabled"} disabled={!selectedTasks.length || !selectedRecipients.length} title="Скачать Excel-файл и открыть короткий черновик письма" onClick={() => prepareMailing(selectedTasks)}>↗ Excel + черновик письма</button>
          {selectedTasks.length > 0 && <button className="selection-clear" onClick={() => setSelectedTaskIds(new Set())}>Очистить выборку</button>}
        </div>

        <div className="registry-grid">
          <div className="task-list">
            <div className="task-list-head-wrap">
              <label className="row-selector" title="Выбрать все показанные"><input type="checkbox" checked={allFilteredSelected} onChange={toggleFilteredSelection} aria-label="Выбрать все показанные поручения" /><i /></label>
              <div className="task-list-head"><span>ПОРУЧЕНИЕ</span><span>ОТВЕТСТВЕННЫЙ</span><span>ИСТОРИЯ СРОКА</span><span>НОВАЯ ПЛАНОВАЯ</span><span>СТАТУС</span></div>
            </div>
            {loading && <div className="loading-state"><i /><span>Поднимаем оперативную картину…</span></div>}
            {!loading && filtered.map((task) => (
              <div className={`task-row-wrap ${selectedTaskIds.has(task.id) ? "checked" : ""}`} key={task.id}>
                <label className="row-selector" title="Добавить в выборку"><input type="checkbox" checked={selectedTaskIds.has(task.id)} onChange={() => toggleTaskSelection(task.id)} aria-label={`Выбрать поручение ${task.id}`} /><i /></label>
                <button aria-current={selected?.id === task.id ? "true" : undefined} className={`task-row deadline-${getDeadlineState(task.due, task.status, runtimeNow)} ${task.priority === "Критический" && task.status !== "Выполнено" ? "critical-row" : ""} ${highlightedId === task.id ? "recently-updated" : ""} ${selected?.id === task.id ? "selected" : ""}`} onClick={() => setSelectedId(task.id)}>
                  <span className="task-main"><small>{task.id} · {task.project}</small><strong>{task.title}</strong><em className={`priority-dot ${task.priority.toLowerCase()}`}>{task.priority}</em></span>
                  <span className="owner-cell"><i>{initials(splitPeople(task.owner)[0] ?? task.owner)}</i><b>{splitPeople(task.owner).join(", ")}</b>{splitPeople(task.owner).length > 1 && <em>+{splitPeople(task.owner).length - 1}</em>}</span>
                  <DeadlineHistory task={task} />
                  <DeadlineIndicator due={task.due} status={task.status} now={runtimeNow} />
                  <span><StatusBadge status={task.status} /></span>
                </button>
              </div>
            ))}
            {!loading && !filtered.length && <div className="empty-state">Сигналов нет. Либо всё хорошо, либо фильтры перестарались.</div>}
          </div>

          <aside className="task-inspector">
            {selected ? <>
              <div className="inspector-fixed">
                <div className="inspector-head">
                  <div><p className="kicker">{selected.id}</p><h3>{selected.title}</h3></div>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="inspector-actions">
                  <button className="action primary-action" disabled={!adminMode} onClick={openEdit}>✎ Изменить</button>
                  <button className="action success-action" disabled={!adminMode || busy || selected.status === "Выполнено"} onClick={openCompletion}>✓ Выполнено</button>
                  <button className="action remove-action" disabled={!adminMode || busy || selected.status === "Снято"} onClick={() => quickStatus("Снято")}>⊘ Снять</button>
                  <button className="action delete-action" disabled={!adminMode || busy} onClick={deleteTask}>⌫ Удалить</button>
                </div>
              </div>
              <div className="inspector-scroll" key={selected.id}>
                <p className="task-description">{selected.description || "Описание не заполнено."}</p>
                <div className="detail-matrix">
                  <div><span>Ответственные</span><strong>{splitPeople(selected.owner).join(", ")}</strong></div>
                  <div><span>Новая плановая дата</span><strong>{formatDate(selected.due)}</strong></div>
                  <div><span>Приоритет</span><strong>{selected.priority}</strong></div>
                  <div><span>Объект</span><strong>{selected.project}</strong></div>
                  <div><span>Постановщик</span><strong>{selected.author}</strong></div>
                  <div><span>Создано</span><strong>{formatDate(selected.created)}</strong></div>
                  {selected.status === "Выполнено" && <div><span>Исполнено фактически</span><strong>{formatDate(selected.completedAt)}</strong></div>}
                </div>
                <label className={selected.karmaExcluded ? "karma-toggle excluded" : "karma-toggle"}>
                  <input type="checkbox" checked={selected.karmaExcluded} disabled={!adminMode || busy} onChange={toggleKarma} />
                  <span><i /><strong>Не учитывать в карме</strong><small>{selected.karmaExcluded ? "Поручение исключено из рейтинга исполнителей" : "Поручение влияет на рейтинг исполнителей"}</small></span>
                </label>
                <details className="deadline-history-detail inspector-section" open>
                  <summary className="history-title"><span>ИСТОРИЯ СРОКА</span><b>{getDeadlineTransfers(selected.history).length}</b></summary>
                  <DeadlineHistory task={selected} detailed />
                </details>
                <button className="mail-link" title="Скачать Excel-файл и открыть короткий черновик письма" onClick={() => prepareMailing([selected])}>↗ Excel + письмо исполнителю</button>
                <details className="history-block inspector-section">
                  <summary className="history-title"><span>ИСТОРИЯ</span><b>{selected.history.length}</b></summary>
                  {selected.history.map((event, index) => (
                    <div className="history-event" key={`${event.date}-${index}`}><i className={index === 0 ? "current" : ""} /><div><time>{event.date}</time><strong>{event.title}</strong><p>{event.text}</p></div></div>
                  ))}
                </details>
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
          <div className="bar-chart">{ownerCounts.map((item, index) => <button className={`bar-row ${owner !== "Все" && executorSurnames(owner).includes(item.label) ? "active" : ""}`} key={item.label} onClick={() => selectOwnerBySurname(item.label)} aria-label={`Показать поручения: ${item.label}`} aria-pressed={owner !== "Все" && executorSurnames(owner).includes(item.label)}><span>0{index + 1}</span><b>{item.label}</b><div><i style={{ width: `${item.value / maxOwner * 100}%` }} /></div><strong>{item.value}</strong></button>)}</div>
        </article>
      </section>

      <OperationsPanels tasks={activeTasks} onSelect={setSelectedId} />

      </> : view === "responsibles" ? <ResponsibleDirectory
        responsibles={responsibles}
        tasks={tasks}
        adminMode={adminMode}
        onCreate={openResponsibleCreate}
        onEdit={openResponsibleEdit}
        onDelete={deleteResponsible}
      /> : <KarmaDashboard tasks={tasks} now={runtimeNow} identities={responsibles} />}

      <footer><span>MINI DISPATCHER / GI</span><span>Данные хранятся в D1 и синхронизируются с Google Sheets автоматически</span></footer>
      {toast && <div className="toast" role="status" aria-live="polite"><i />{toast}</div>}
      {modal && <TaskModal mode={modal} draft={draft} setDraft={setDraft} responsibles={responsibles} onClose={() => setModal(null)} onSubmit={saveTask} busy={busy} />}
      {completionModal && selected && <CompletionModal task={selected} date={completionDate} setDate={setCompletionDate} onClose={() => setCompletionModal(false)} onSubmit={completeTask} busy={busy} />}
      {responsibleModal && <ResponsibleModal mode={responsibleModal} draft={responsibleDraft} setDraft={setResponsibleDraft} onClose={() => setResponsibleModal(null)} onSubmit={saveResponsible} busy={busy} />}
    </main>
  );
}

function DeadlineHistory({ task, detailed = false }: { task: Task; detailed?: boolean }) {
  const transfers = getDeadlineTransfers(task.history);
  if (detailed) {
    return <div className="deadline-timeline">
      <div><span>1 · Дата создания</span><strong>{formatDate(task.created)}</strong></div>
      <div><span>2 · Все переносы</span>{transfers.length
        ? <ol>{transfers.map((transfer, index) => <li key={`${transfer.changedAt}-${index}`}><b>{transfer.from} → {transfer.to}</b><small>{transfer.changedAt}</small></li>)}</ol>
        : <strong>Переносов не было</strong>}</div>
      <div><span>3 · Новая плановая</span><strong>{formatStoredDate(task.due)}</strong></div>
    </div>;
  }
  return <span className="deadline-history-cell">
    <small>Создано: {formatDate(task.created)}</small>
    <b>{transfers.length ? `${transfers.length} ${pluralTransfer(transfers.length)}` : "Без переносов"}</b>
    {transfers.length > 0 && <em>{transfers.map((transfer) => transfer.to).join(" · ")}</em>}
  </span>;
}

function pluralTransfer(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  return lastTwo >= 11 && lastTwo <= 14 ? "переносов" : last === 1 ? "перенос" : last >= 2 && last <= 4 ? "переноса" : "переносов";
}

function TaskModal({ mode, draft, setDraft, responsibles, onClose, onSubmit, busy }: {
  mode: "create" | "edit"; draft: TaskDraft; setDraft: (draft: TaskDraft) => void;
  responsibles: Responsible[]; onClose: () => void; onSubmit: (event: FormEvent) => void; busy: boolean;
}) {
  const field = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft({ ...draft, [key]: value });
  const selectedNames = splitPeople(draft.owner);
  const toggleResponsible = (responsible: Responsible) => {
    const nextNames = selectedNames.includes(responsible.name)
      ? selectedNames.filter((name) => name !== responsible.name)
      : [...selectedNames, responsible.name];
    const nextEmails = nextNames.map((name) => responsibles.find((item) => item.name === name)?.email ?? "").filter(Boolean);
    setDraft({ ...draft, owner: nextNames.join("; "), ownerEmail: nextEmails.join("; ") });
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-modal-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="task-modal" onSubmit={onSubmit}>
        <div className="modal-head"><div><p className="kicker">УПРАВЛЕНИЕ ПОРУЧЕНИЕМ</p><h2 id="task-modal-title">{mode === "create" ? "Новое поручение" : "Редактирование"}</h2></div><button type="button" aria-label="Закрыть окно" onClick={onClose}>×</button></div>
        <div className="form-grid">
          <label className="wide"><span>Название *</span><input required autoFocus value={draft.title} onChange={(e) => field("title", e.target.value)} placeholder="Что необходимо сделать" /></label>
          <div className="wide responsible-field">
            <span>Ответственные *</span>
            <details className="responsible-picker">
              <summary>{selectedNames.length ? `Выбрано: ${selectedNames.length}` : "Выберите из справочника"}<i>⌄</i></summary>
              <div className="responsible-popup">
                {responsibles.map((responsible) => <label key={responsible.id}>
                  <input type="checkbox" checked={selectedNames.includes(responsible.name)} onChange={() => toggleResponsible(responsible)} />
                  <span><strong>{responsible.name}</strong><small>{responsible.position || responsible.email || "Без дополнительных данных"}</small></span>
                </label>)}
                {!responsibles.length && <p>Справочник пуст. Сначала добавьте ответственного в отдельной вкладке.</p>}
              </div>
            </details>
            <div className="selected-responsibles">{selectedNames.map((name) => <button type="button" key={name} onClick={() => {
              const responsible = responsibles.find((item) => item.name === name);
              if (responsible) toggleResponsible(responsible);
            }}>{name}<i>×</i></button>)}</div>
          </div>
          <label><span>Срок *</span><input required type="date" value={draft.due} onChange={(e) => field("due", e.target.value)} /></label>
          <label><span>Статус</span><select value={draft.status} onChange={(e) => field("status", e.target.value as Status)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          {draft.status === "Выполнено" && <label className="completion-date-field"><span>Дата фактического исполнения *</span><input required type="date" max={todaySaratov()} value={draft.completedAt} onInput={(e) => field("completedAt", e.currentTarget.value)} /><small>Можно указать сегодняшнюю или прошедшую дату. Она используется в расчёте кармы.</small></label>}
          <label><span>Приоритет</span><select value={draft.priority} onChange={(e) => field("priority", e.target.value as Priority)}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Объект / проект</span><input value={draft.project} onChange={(e) => field("project", e.target.value)} placeholder="Объект 1" /></label>
          <label className="wide karma-modal-toggle"><input type="checkbox" checked={draft.karmaExcluded} onChange={(event) => field("karmaExcluded", event.target.checked)} /><span><strong>Не учитывать поручение в карме</strong><small>Исключает поручение из расчёта для всех назначенных исполнителей</small></span></label>
          <label className="wide"><span>Постановщик</span><input value={draft.author} onChange={(e) => field("author", e.target.value)} /></label>
          <label className="wide"><span>Описание</span><textarea value={draft.description} onChange={(e) => field("description", e.target.value)} placeholder="Условия, ожидаемый результат, необходимые материалы" /></label>
        </div>
        <div className="modal-actions"><button type="button" className="cancel-button" onClick={onClose}>Отмена</button><button disabled={busy || !draft.owner.trim()} className="save-button">{busy ? "Сохраняем…" : mode === "create" ? "Создать поручение" : "Сохранить изменения"}</button></div>
      </form>
    </div>
  );
}

function CompletionModal({ task, date, setDate, onClose, onSubmit, busy }: {
  task: Task; date: string; setDate: (value: string) => void;
  onClose: () => void; onSubmit: (event: FormEvent) => void; busy: boolean;
}) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="completion-modal-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="task-modal completion-modal" onSubmit={onSubmit}>
      <div className="modal-head"><div><p className="kicker">ПОДТВЕРЖДЕНИЕ ВЫПОЛНЕНИЯ</p><h2 id="completion-modal-title">Дата исполнения</h2></div><button type="button" aria-label="Закрыть окно" onClick={onClose}>×</button></div>
      <div className="completion-modal-body">
        <p><strong>{task.id}</strong> · {task.title}</p>
        <label><span>Фактическая дата исполнения *</span><input required autoFocus type="date" max={todaySaratov()} value={date} onInput={(event) => setDate(event.currentTarget.value)} /></label>
        <small>Дата может быть сегодняшней или прошедшей. Карма будет рассчитана относительно планового срока {formatDate(task.due)}.</small>
      </div>
      <div className="modal-actions"><button type="button" className="cancel-button" onClick={onClose}>Отмена</button><button disabled={busy || !date} className="save-button">{busy ? "Сохраняем…" : "Подтвердить выполнение"}</button></div>
    </form>
  </div>;
}

function ResponsibleDirectory({ responsibles, tasks, adminMode, onCreate, onEdit, onDelete }: {
  responsibles: Responsible[]; tasks: Task[]; adminMode: boolean;
  onCreate: () => void; onEdit: (responsible: Responsible) => void; onDelete: (responsible: Responsible) => void;
}) {
  return <section className="directory-surface">
    <div className="directory-head">
      <div><p className="kicker">СПРАВОЧНИК / D1</p><h2>Ответственные</h2><p>Единый список исполнителей для назначения в карточках поручений.</p></div>
      <button className="create-button" disabled={!adminMode} onClick={onCreate}><span>＋</span> Добавить ответственного</button>
    </div>
    <div className="directory-summary">
      <div><span>В справочнике</span><strong>{responsibles.length}</strong></div>
      <div><span>Назначены в поручениях</span><strong>{responsibles.filter((item) => tasks.some((task) => splitPeople(task.owner).includes(item.name))).length}</strong></div>
      <div><span>Без email</span><strong>{responsibles.filter((item) => !item.email).length}</strong></div>
    </div>
    <div className="directory-table">
      <div className="directory-row directory-labels"><span>ФИО</span><span>Должность / роль</span><span>Контакты</span><span>Поручения</span><span /></div>
      {responsibles.map((responsible) => {
        const taskCount = tasks.filter((task) => splitPeople(task.owner).includes(responsible.name)).length;
        return <div className="directory-row" key={responsible.id}>
          <span className="directory-person"><i>{initials(responsible.name)}</i><strong>{responsible.name}</strong></span>
          <span>{responsible.position || "Не указана"}</span>
          <span className="directory-contacts"><b>{responsible.email || "Email не указан"}</b><small>{responsible.phone || "Телефон не указан"}</small></span>
          <span className="directory-task-count"><strong>{taskCount}</strong><small>активных назначений</small></span>
          <span className="directory-actions"><button className="ghost-button" disabled={!adminMode} onClick={() => onEdit(responsible)}>Изменить</button><button className="directory-delete" disabled={!adminMode} onClick={() => onDelete(responsible)}>Удалить</button></span>
        </div>;
      })}
      {!responsibles.length && <div className="directory-empty">Справочник пока пуст. Добавьте первого ответственного.</div>}
    </div>
  </section>;
}

function ResponsibleModal({ mode, draft, setDraft, onClose, onSubmit, busy }: {
  mode: "create" | "edit"; draft: ResponsibleDraft; setDraft: (draft: ResponsibleDraft) => void;
  onClose: () => void; onSubmit: (event: FormEvent) => void; busy: boolean;
}) {
  const field = <K extends keyof ResponsibleDraft>(key: K, value: ResponsibleDraft[K]) => setDraft({ ...draft, [key]: value });
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="responsible-modal-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="task-modal responsible-modal" onSubmit={onSubmit}>
      <div className="modal-head"><div><p className="kicker">СПРАВОЧНИК ОТВЕТСТВЕННЫХ</p><h2 id="responsible-modal-title">{mode === "create" ? "Новый ответственный" : "Корректировка данных"}</h2></div><button type="button" aria-label="Закрыть окно" onClick={onClose}>×</button></div>
      <div className="form-grid">
        <label className="wide"><span>ФИО *</span><input required autoFocus value={draft.name} onChange={(event) => field("name", event.target.value)} placeholder="Фамилия Имя Отчество" /></label>
        <label className="wide"><span>Должность / роль</span><input value={draft.position} onChange={(event) => field("position", event.target.value)} placeholder="Начальник отдела" /></label>
        <label><span>Email</span><input type="email" value={draft.email} onChange={(event) => field("email", event.target.value)} placeholder="employee@company.ru" /></label>
        <label><span>Телефон</span><input type="tel" value={draft.phone} onChange={(event) => field("phone", event.target.value)} placeholder="+7 900 000-00-00" /></label>
      </div>
      <div className="modal-actions"><button type="button" className="cancel-button" onClick={onClose}>Отмена</button><button disabled={busy} className="save-button">{busy ? "Сохраняем…" : mode === "create" ? "Добавить" : "Сохранить"}</button></div>
    </form>
  </div>;
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="select-control"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option>Все</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge ${statusClass[status]}`}><i />{status}</span>;
}

function executorSurnames(owner: string) {
  return [...new Set(owner
    .split(/[;,]/)
    .map((person) => person.replace(/\([^)]*\)/g, "").trim())
    .filter((person) => person && !person.includes("/") && !person.startsWith("Ответственный"))
    .map((person) => person.split(/\s+/)[0])
    .filter(Boolean))];
}

function splitPeople(value: string) {
  return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeGoogleSync(value: unknown): GoogleSyncInfo {
  if (value && typeof value === "object" && "state" in value) {
    const sync = value as Partial<GoogleSyncInfo>;
    return {
      state: sync.state === "online" || sync.state === "pending" ? sync.state : "unavailable",
      pending: typeof sync.pending === "number" ? sync.pending : 0,
      lastSync: typeof sync.lastSync === "string" ? sync.lastSync : null,
      lastError: typeof sync.lastError === "string" ? sync.lastError : null,
    };
  }
  return { state: value === "online" ? "online" : "unavailable", pending: 0, lastSync: null, lastError: null };
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatSystemTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Saratov",
  }).format(date).replace(",", " ·");
}

function getCurrentWeek(timestamp: number) {
  const today = new Date(timestamp || 0);
  today.setHours(12, 0, 0, 0);
  const dayFromMonday = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - dayFromMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const dateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  const month = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(end);
  const label = start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${month}`
    : `${start.getDate()} ${new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(start)} — ${end.getDate()} ${month}`;
  return { today: dateKey(today), end: dateKey(end), label };
}

function metricState(label: string) {
  if (label === "Просрочено") return "критично";
  if (label === "Уточнить" || label === "На проверке") return "контроль";
  if (label === "Выполнено") return "норма";
  return label === "В работе" ? "активно" : "реестр";
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
