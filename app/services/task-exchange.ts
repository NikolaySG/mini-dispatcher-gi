export type ExportableTask = {
  id: string;
  title: string;
  owner: string;
  ownerEmail: string;
  status: string;
  priority: string;
  due: string;
  project: string;
};

const formatDate = (date: string) =>
  date ? new Intl.DateTimeFormat("ru-RU").format(new Date(`${date}T12:00:00`)) : "не определён";

// Browser adapter. A future mail integration can replace this function
// without changing the task register or task card.
export function createTaskMailto(task: ExportableTask) {
  const subject = `[${task.id}] ${task.title} — запрос статуса`;
  const body = `Добрый день!

Просьба предоставить актуальный статус по поручению ${task.id} «${task.title}».

Срок: ${formatDate(task.due)}.
Текущий статус: ${task.status}.

С уважением,
Главный инженер`;

  return `mailto:${task.ownerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Browser adapter. It can later be replaced by an API export endpoint.
export function downloadTasksCsv(rows: ExportableTask[], suffix: string) {
  const headers = ["ID", "Поручение", "Ответственный", "Статус", "Приоритет", "Срок", "Объект"];
  const csvRows = rows.map((task) => [
    task.id, task.title, task.owner, task.status, task.priority, formatDate(task.due), task.project,
  ]);
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const content = "\uFEFF" + [headers, ...csvRows]
    .map((row) => row.map(escape).join(";"))
    .join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `porucheniya-${suffix}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
