import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { appMeta, tasks } from "../../../db/schema";
import { JOURNAL_IMPORT_KEY, journalTasks } from "../../data/journal-import";

type HistoryEvent = { date: string; title: string; text: string };

const seed = [
  ["GI-2026-001", "Поручение 1", "Проверить комплектность исполнительной документации и представить перечень недостающих материалов.", "Ответственный1", "responsible1@example.com", "Просрочено", "Критический", "2026-07-28", "2026-07-18", "Главный инженер", "Объект 1"],
  ["GI-2026-002", "Поручение 2", "Согласовать график устранения замечаний и подтвердить доступность ресурсов.", "Ответственный2", "responsible2@example.com", "В работе", "Высокий", "2026-08-01", "2026-07-21", "Главный инженер", "Объект 2"],
  ["GI-2026-003", "Поручение 3", "Подготовить сводную ведомость технических решений для проверки.", "Ответственный1", "responsible1@example.com", "На проверке", "Средний", "2026-08-03", "2026-07-22", "Заместитель главного инженера", "Объект 1"],
  ["GI-2026-004", "Поручение 4", "Актуализировать перечень контактных лиц подрядных организаций.", "Ответственный3", "responsible3@example.com", "Выполнено", "Низкий", "2026-07-26", "2026-07-16", "Главный инженер", "Объект 3"],
  ["GI-2026-005", "Поручение 5", "Уточнить границы ответственности по монтажу оборудования.", "Ответственный2", "responsible2@example.com", "Требует уточнения", "Высокий", "2026-08-05", "2026-07-27", "Главный инженер", "Объект 2"],
  ["GI-2026-006", "Поручение 6", "Проверить замечания авторского надзора и назначить исполнителей.", "Ответственный4", "responsible4@example.com", "В работе", "Средний", "2026-08-08", "2026-07-28", "Заместитель главного инженера", "Объект 4"],
  ["GI-2026-007", "Поручение 7", "Представить протокол технического совещания.", "Ответственный3", "responsible3@example.com", "Выполнено", "Средний", "2026-07-29", "2026-07-20", "Главный инженер", "Объект 3"],
  ["GI-2026-008", "Поручение 8", "Закрыть замечания по входному контролю оборудования.", "Ответственный4", "responsible4@example.com", "Просрочено", "Высокий", "2026-07-27", "2026-07-17", "Главный инженер", "Объект 4"],
  ["GI-2026-009", "Поручение 9", "Обновить реестр применимых нормативных документов.", "Ответственный1", "responsible1@example.com", "В работе", "Низкий", "2026-08-12", "2026-07-29", "Главный инженер", "Объект 1"],
] as const;

function nowRu() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Saratov",
  }).format(new Date()).replace(",", "");
}

function parseHistory(value: string): HistoryEvent[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serialize(row: typeof tasks.$inferSelect) {
  const { historyJson, updatedAt, ...task } = row;
  return { ...task, history: parseHistory(historyJson), updatedAt };
}

async function ensureSeed() {
  const db = getDb();
  const existing = await db.select({ id: tasks.id }).from(tasks).limit(1);
  if (existing.length) return;
  await db.insert(tasks).values(seed.map(([id, title, description, owner, ownerEmail, status, priority, due, created, author, project]) => ({
    id, title, description, owner, ownerEmail, status, priority, due, created, author, project,
    historyJson: JSON.stringify([{ date: `${created.split("-").reverse().join(".")}, 09:00`, title: "Поручение создано", text: `Назначен ${owner}.` }]),
  })));
}

async function ensureJournalImport() {
  const db = getDb();
  const [completed] = await db.select({ key: appMeta.key }).from(appMeta)
    .where(eq(appMeta.key, JOURNAL_IMPORT_KEY)).limit(1);
  if (completed) return;

  for (let offset = 0; offset < journalTasks.length; offset += 5) {
    await db.insert(tasks).values(journalTasks.slice(offset, offset + 5)).onConflictDoNothing();
  }
  await db.insert(appMeta).values({
    key: JOURNAL_IMPORT_KEY,
    value: JSON.stringify({
      source: "Журнал_исполнения_поручений_ПОЛНЫЙ_с_дополнениями.xlsx",
      imported: journalTasks.length,
      importedAt: "2026-07-31",
    }),
  }).onConflictDoNothing();
}

export async function GET() {
  try {
    await ensureSeed();
    await ensureJournalImport();
    const rows = await getDb().select().from(tasks).orderBy(asc(tasks.id));
    return Response.json({ tasks: rows.map(serialize) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось загрузить поручения" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Partial<typeof tasks.$inferInsert>;
    if (!payload.title?.trim() || !payload.owner?.trim() || !payload.due) {
      return Response.json({ error: "Заполните название, ответственного и срок" }, { status: 400 });
    }
    const id = `GI-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const created = new Date().toISOString().slice(0, 10);
    const history: HistoryEvent[] = [{ date: nowRu(), title: "Поручение создано", text: `Назначен ${payload.owner.trim()}.` }];
    const [row] = await getDb().insert(tasks).values({
      id,
      title: payload.title.trim(),
      description: payload.description?.trim() ?? "",
      owner: payload.owner.trim(),
      ownerEmail: payload.ownerEmail?.trim() ?? "",
      status: payload.status ?? "В работе",
      priority: payload.priority ?? "Средний",
      due: payload.due,
      created,
      author: payload.author?.trim() || "Главный инженер",
      project: payload.project?.trim() || "Без объекта",
      historyJson: JSON.stringify(history),
    }).returning();
    return Response.json({ task: serialize(row) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать поручение" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as Record<string, string>;
    if (!payload.id) return Response.json({ error: "Не указан ID" }, { status: 400 });
    const [existing] = await getDb().select().from(tasks).where(eq(tasks.id, payload.id)).limit(1);
    if (!existing) return Response.json({ error: "Поручение не найдено" }, { status: 404 });

    const nextStatus = payload.status ?? existing.status;
    const history = parseHistory(existing.historyJson);
    const changes: string[] = [];
    if (payload.status && payload.status !== existing.status) changes.push(`Статус: ${existing.status} → ${payload.status}`);
    if (payload.due && payload.due !== existing.due) changes.push(`Срок изменён на ${payload.due.split("-").reverse().join(".")}`);
    history.unshift({
      date: nowRu(),
      title: nextStatus === "Выполнено" ? "Выполнение подтверждено" : nextStatus === "Снято" ? "Поручение снято" : "Карточка обновлена",
      text: changes.join(". ") || "Изменены реквизиты поручения.",
    });

    const [row] = await getDb().update(tasks).set({
      title: payload.title?.trim() ?? existing.title,
      description: payload.description?.trim() ?? existing.description,
      owner: payload.owner?.trim() ?? existing.owner,
      ownerEmail: payload.ownerEmail?.trim() ?? existing.ownerEmail,
      status: nextStatus,
      priority: payload.priority ?? existing.priority,
      due: payload.due ?? existing.due,
      author: payload.author?.trim() ?? existing.author,
      project: payload.project?.trim() ?? existing.project,
      historyJson: JSON.stringify(history),
      updatedAt: new Date().toISOString(),
    }).where(eq(tasks.id, payload.id)).returning();
    return Response.json({ task: serialize(row) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось обновить поручение" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Не указан ID" }, { status: 400 });
    await getDb().delete(tasks).where(eq(tasks.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось удалить поручение" }, { status: 500 });
  }
}
