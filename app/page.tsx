"use client";

import { useMemo, useState } from "react";
import { createTaskMailto, downloadTasksCsv } from "./services/task-exchange";

type Status = "Выполнено" | "В работе" | "Просрочено" | "На проверке" | "Требует уточнения";
type Priority = "Критический" | "Высокий" | "Средний" | "Низкий";

type Task = {
  id: string; title: string; description: string; owner: string; ownerEmail: string;
  status: Status; priority: Priority; due: string; created: string; author: string; project: string;
  history: { date: string; title: string; text: string }[];
};

const tasks: Task[] = [
  {
    id: "GI-2026-001", title: "Поручение 1", owner: "Ответственный1",
    ownerEmail: "responsible1@example.com", status: "Просрочено", priority: "Критический",
    due: "2026-07-28", created: "2026-07-18", author: "Главный инженер", project: "Объект 1",
    description: "Проверить комплектность исполнительной документации и представить перечень недостающих материалов.",
    history: [
      { date: "28.07.2026, 16:40", title: "Срок истёк", text: "Подтверждение выполнения не получено." },
      { date: "24.07.2026, 09:15", title: "Напоминание направлено", text: "Исполнитель уведомлён о приближении срока." },
      { date: "18.07.2026, 11:20", title: "Поручение создано", text: "Назначен Ответственный1." },
    ],
  },
  {
    id: "GI-2026-002", title: "Поручение 2", owner: "Ответственный2",
    ownerEmail: "responsible2@example.com", status: "В работе", priority: "Высокий",
    due: "2026-08-01", created: "2026-07-21", author: "Главный инженер", project: "Объект 2",
    description: "Согласовать график устранения замечаний и подтвердить доступность ресурсов.",
    history: [
      { date: "29.07.2026, 14:10", title: "Добавлен комментарий", text: "График подготовлен, идёт внутреннее согласование." },
      { date: "21.07.2026, 10:05", title: "Поручение создано", text: "Назначен Ответственный2." },
    ],
  },
  {
    id: "GI-2026-003", title: "Поручение 3", owner: "Ответственный1",
    ownerEmail: "responsible1@example.com", status: "На проверке", priority: "Средний",
    due: "2026-08-03", created: "2026-07-22", author: "Заместитель главного инженера", project: "Объект 1",
    description: "Подготовить сводную ведомость технических решений для проверки.",
    history: [
      { date: "30.07.2026, 08:45", title: "Передано на проверку", text: "Приложена актуальная редакция ведомости." },
      { date: "22.07.2026, 15:30", title: "Поручение создано", text: "Назначен Ответственный1." },
    ],
  },
  {
    id: "GI-2026-004", title: "Поручение 4", owner: "Ответственный3",
    ownerEmail: "responsible3@example.com", status: "Выполнено", priority: "Низкий",
    due: "2026-07-26", created: "2026-07-16", author: "Главный инженер", project: "Объект 3",
    description: "Актуализировать перечень контактных лиц подрядных организаций.",
    history: [
      { date: "25.07.2026, 12:05", title: "Выполнение подтверждено", text: "Перечень проверен и принят." },
      { date: "16.07.2026, 09:40", title: "Поручение создано", text: "Назначен Ответственный3." },
    ],
  },
  {
    id: "GI-2026-005", title: "Поручение 5", owner: "Ответственный2",
    ownerEmail: "responsible2@example.com", status: "Требует уточнения", priority: "Высокий",
    due: "2026-08-05", created: "2026-07-27", author: "Главный инженер", project: "Объект 2",
    description: "Уточнить границы ответственности по монтажу оборудования.",
    history: [
      { date: "29.07.2026, 17:25", title: "Запрошено уточнение", text: "Требуется решение по смежным зонам ответственности." },
      { date: "27.07.2026, 10:50", title: "Поручение создано", text: "Назначен Ответственный2." },
    ],
  },
  {
    id: "GI-2026-006", title: "Поручение 6", owner: "Ответственный4",
    ownerEmail: "responsible4@example.com", status: "В работе", priority: "Средний",
    due: "2026-08-08", created: "2026-07-28", author: "Заместитель главного инженера", project: "Объект 4",
    description: "Проверить замечания авторского надзора и назначить исполнителей.",
    history: [{ date: "28.07.2026, 13:20", title: "Поручение создано", text: "Назначен Ответственный4." }],
  },
  {
    id: "GI-2026-007", title: "Поручение 7", owner: "Ответственный3",
    ownerEmail: "responsible3@example.com", status: "Выполнено", priority: "Средний",
    due: "2026-07-29", created: "2026-07-20", author: "Главный инженер", project: "Объект 3",
    description: "Представить протокол технического совещания.",
    history: [{ date: "29.07.2026, 11:30", title: "Выполнение подтверждено", text: "Протокол зарегистрирован." }],
  },
  {
    id: "GI-2026-008", title: "Поручение 8", owner: "Ответственный4",
    ownerEmail: "responsible4@example.com", status: "Просрочено", priority: "Высокий",
    due: "2026-07-27", created: "2026-07-17", author: "Главный инженер", project: "Объект 4",
    description: "Закрыть замечания по входному контролю оборудования.",
    history: [{ date: "27.07.2026, 18:00", title: "Срок истёк", text: "Отчёт исполнителя отсутствует." }],
  },
  {
    id: "GI-2026-009", title: "Поручение 9", owner: "Ответственный1",
    ownerEmail: "responsible1@example.com", status: "В работе", priority: "Низкий",
    due: "2026-08-12", created: "2026-07-29", author: "Главный инженер", project: "Объект 1",
    description: "Обновить реестр применимых нормативных документов.",
    history: [{ date: "29.07.2026, 12:10", title: "Поручение создано", text: "Назначен Ответственный1." }],
  },
];

const statusClass: Record<Status, string> = {
  "Выполнено": "status done", "В работе": "status active", "Просрочено": "status overdue",
  "На проверке": "status review", "Требует уточнения": "status clarify",
};
const statusColors: Record<Status, string> = {
  "Выполнено": "#2e7d5b", "В работе": "#2563a6", "Просрочено": "#c0392b",
  "На проверке": "#8a5a12", "Требует уточнения": "#6b5ca5",
};
const formatDate = (date: string) => new Intl.DateTimeFormat("ru-RU").format(new Date(`${date}T12:00:00`));

export default function Home() {
  const [owner, setOwner] = useState("Все");
  const [status, setStatus] = useState("Все");
  const [priority, setPriority] = useState("Все");
  const [due, setDue] = useState("Все");
  const [selectedId, setSelectedId] = useState(tasks[0].id);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => tasks.filter((task) => {
    const diff = Math.ceil((new Date(`${task.due}T12:00:00`).getTime() - new Date("2026-07-30T12:00:00").getTime()) / 86400000);
    const dueMatch = due === "Все" || (due === "Просрочено" && diff < 0) || (due === "7 дней" && diff >= 0 && diff <= 7) || (due === "Позже" && diff > 7);
    const q = query.trim().toLowerCase();
    return (owner === "Все" || task.owner === owner) && (status === "Все" || task.status === status)
      && (priority === "Все" || task.priority === priority) && dueMatch
      && (!q || `${task.id} ${task.title} ${task.description}`.toLowerCase().includes(q));
  }), [owner, status, priority, due, query]);
  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0];
  const statusCounts = Object.keys(statusColors).map((key) => ({ label: key as Status, value: tasks.filter((task) => task.status === key).length }));
  const ownerCounts = [...new Set(tasks.map((task) => task.owner))].map((name) => ({ label: name, value: tasks.filter((task) => task.owner === name).length }));
  const maxOwner = Math.max(...ownerCounts.map((item) => item.value));
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "Выполнено").length;
  const overdue = tasks.filter((task) => task.status === "Просрочено").length;
  const mailto = createTaskMailto(selected);
  const metrics = [
    ["Всего", total, "neutral"], ["Выполнено", completed, "green"],
    ["В работе", tasks.filter((task) => task.status === "В работе").length, "blue"],
    ["Просрочено", overdue, "red"], ["На проверке", tasks.filter((task) => task.status === "На проверке").length, "amber"],
    ["Требует уточнения", tasks.filter((task) => task.status === "Требует уточнения").length, "purple"],
  ] as const;

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">ГИ</span><div><p className="eyebrow">КОНТРОЛЬ ИСПОЛНЕНИЯ</p><h1>Мини-диспетчерская главного инженера</h1></div></div>
        <div className="header-meta"><span className="sync-dot" /><span>Локальные данные</span><span className="divider" /><span>30 июля 2026</span></div>
      </header>
      <div className="workspace">
        <section className="summary-row" aria-label="Сводные показатели">
          {metrics.map(([label, value, tone]) => (
            <button className={`metric ${tone}`} key={label} onClick={() => label !== "Всего" && setStatus(label)}>
              <span>{label}</span><strong>{value}</strong><small>{label === "Всего" ? "поручений в реестре" : `${Math.round(value / total * 100)}% от общего числа`}</small>
            </button>
          ))}
        </section>
        <section className="control-panel">
          <div className="section-heading">
            <div><p className="eyebrow">ОПЕРАТИВНЫЙ РЕЕСТР</p><h2>Поручения</h2></div>
            <div className="actions"><button className="button secondary" onClick={() => downloadTasksCsv(tasks, "vse")}>⇩ CSV: все</button><button className="button primary" onClick={() => downloadTasksCsv(filtered, "filtr")}>⇩ CSV: по фильтру</button></div>
          </div>
          <div className="filters">
            <label className="search-field"><span>Поиск</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID или текст поручения" /></label>
            <Filter label="Ответственный" value={owner} onChange={setOwner} options={[...new Set(tasks.map((task) => task.owner))]} />
            <Filter label="Статус" value={status} onChange={setStatus} options={Object.keys(statusColors)} />
            <Filter label="Приоритет" value={priority} onChange={setPriority} options={["Критический", "Высокий", "Средний", "Низкий"]} />
            <Filter label="Срок" value={due} onChange={setDue} options={["Просрочено", "7 дней", "Позже"]} />
            <button className="reset" onClick={() => { setOwner("Все"); setStatus("Все"); setPriority("Все"); setDue("Все"); setQuery(""); }}>Сбросить</button>
          </div>
          <div className="registry-layout">
            <div className="table-wrap">
              <table><thead><tr><th>ID / ПОРУЧЕНИЕ</th><th>ОТВЕТСТВЕННЫЙ</th><th>СТАТУС</th><th>ПРИОРИТЕТ</th><th>СРОК</th><th /></tr></thead>
                <tbody>{filtered.map((task) => (
                  <tr key={task.id} className={task.id === selected.id ? "selected-row" : ""} onClick={() => setSelectedId(task.id)}>
                    <td><span className="task-id">{task.id}</span><strong>{task.title}</strong><small>{task.project}</small></td><td>{task.owner}</td>
                    <td><span className={statusClass[task.status]}><i />{task.status}</span></td><td><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span></td>
                    <td className={task.status === "Просрочено" ? "date-overdue" : ""}>{formatDate(task.due)}</td><td><button className="row-arrow" aria-label={`Открыть ${task.id}`}>›</button></td>
                  </tr>
                ))}</tbody>
              </table>
              {filtered.length === 0 && <div className="empty">По выбранным условиям поручений нет.</div>}
              <div className="table-footer">Показано {filtered.length} из {tasks.length} поручений</div>
            </div>
            <aside className="detail-card" aria-label="Карточка поручения">
              <div className="detail-top"><div><span className="task-id">{selected.id}</span><h3>{selected.title}</h3></div><span className={statusClass[selected.status]}><i />{selected.status}</span></div>
              <p className="description">{selected.description}</p>
              <dl className="details-grid">
                <div><dt>Ответственный</dt><dd>{selected.owner}</dd></div><div><dt>Приоритет</dt><dd>{selected.priority}</dd></div>
                <div><dt>Срок</dt><dd className={selected.status === "Просрочено" ? "date-overdue" : ""}>{formatDate(selected.due)}</dd></div><div><dt>Объект</dt><dd>{selected.project}</dd></div>
                <div><dt>Постановщик</dt><dd>{selected.author}</dd></div><div><dt>Создано</dt><dd>{formatDate(selected.created)}</dd></div>
              </dl>
              <a className="mail-button" href={mailto}>✉ Сформировать письмо исполнителю</a>
              <div className="history"><p className="eyebrow">ИСТОРИЯ ПОРУЧЕНИЯ</p>
                {selected.history.map((event, index) => (
                  <div className="history-event" key={`${selected.id}-${event.date}`}><span className={index === 0 ? "timeline-dot current" : "timeline-dot"} /><div><time>{event.date}</time><strong>{event.title}</strong><p>{event.text}</p></div></div>
                ))}
              </div>
            </aside>
          </div>
        </section>
        <section className="analytics-grid">
          <div className="chart-card">
            <div className="section-heading compact"><div><p className="eyebrow">АНАЛИТИКА</p><h2>Распределение по статусам</h2></div><span className="period">Текущий реестр</span></div>
            <div className="status-chart">
              <div className="donut" style={{ background: "conic-gradient(#2e7d5b 0 22.2%, #2563a6 22.2% 55.5%, #c0392b 55.5% 77.7%, #8a5a12 77.7% 88.8%, #6b5ca5 88.8% 100%)" }}><div><strong>{total}</strong><span>всего</span></div></div>
              <div className="legend">{statusCounts.map((item) => <div key={item.label}><span><i style={{ background: statusColors[item.label] }} />{item.label}</span><strong>{item.value}</strong></div>)}</div>
            </div>
          </div>
          <div className="chart-card">
            <div className="section-heading compact"><div><p className="eyebrow">НАГРУЗКА</p><h2>Поручения по ответственным</h2></div><span className="period">Все статусы</span></div>
            <div className="bar-chart">{ownerCounts.map((item) => <div className="bar-row" key={item.label}><span>{item.label}</span><div className="bar-track"><i style={{ width: `${item.value / maxOwner * 100}%` }} /></div><strong>{item.value}</strong></div>)}</div>
          </div>
        </section>
        <footer><span>Мини-диспетчерская ГИ · локальный режим</span><span>Архитектура подготовлена для подключения API почты и базы данных</span></footer>
      </div>
    </main>
  );
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option>Все</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
