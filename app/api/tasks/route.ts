import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { appMeta, tasks } from "../../../db/schema";
import { JOURNAL_IMPORT_KEY, journalTasks } from "../../data/journal-import";

type HistoryEvent = { date: string; title: string; text: string };

const DEMO_CLEANUP_KEY = "demo-tasks-cleanup-2026-07-31-v1";
const DEMO_TASK_IDS = Array.from({ length: 9 }, (_, index) => `GI-2026-${String(index + 1).padStart(3, "0")}`);

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

async function ensureDemoCleanup() {
  const db = getDb();
  const [completed] = await db.select({ key: appMeta.key }).from(appMeta)
    .where(eq(appMeta.key, DEMO_CLEANUP_KEY)).limit(1);
  if (completed) return;

  await db.delete(tasks).where(inArray(tasks.id, DEMO_TASK_IDS));
  await db.insert(appMeta).values({
    key: DEMO_CLEANUP_KEY,
    value: JSON.stringify({ deletedIds: DEMO_TASK_IDS, deletedAt: "2026-07-31" }),
  }).onConflictDoNothing();
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
    await ensureDemoCleanup();
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
