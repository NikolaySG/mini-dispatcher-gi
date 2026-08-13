import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { appMeta, responsibles, tasks } from "../../../db/schema";
import { RESPONSIBLE_DIRECTORY_IMPORT_KEY, RESPONSIBLE_DIRECTORY_SOURCE, responsibleDirectoryImport } from "../../data/responsible-directory-import";
import { enqueueGoogleSync, getGoogleSyncStatus, scheduleGoogleSheetsSync } from "../../services/google-sheets-sync";

const DELETED_RESPONSIBLES_KEY = "deleted-responsibles-v1";

function splitPeople(value: string) {
  return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

async function importTaskOwners() {
  const db = getDb();
  const [current, taskRows, deletedRow] = await Promise.all([
    db.select().from(responsibles),
    db.select({ owner: tasks.owner, ownerEmail: tasks.ownerEmail }).from(tasks),
    db.select({ value: appMeta.value }).from(appMeta).where(eq(appMeta.key, DELETED_RESPONSIBLES_KEY)).limit(1),
  ]);
  const known = new Set(current.map((item) => item.name.trim().toLocaleLowerCase("ru")));
  const deleted = new Set<string>(deletedRow[0] ? JSON.parse(deletedRow[0].value) : []);
  const pending: typeof responsibles.$inferInsert[] = [];

  for (const task of taskRows) {
    const names = splitPeople(task.owner);
    const emails = splitPeople(task.ownerEmail);
    names.forEach((name, index) => {
      const key = name.toLocaleLowerCase("ru");
      if (known.has(key) || deleted.has(key)) return;
      known.add(key);
      pending.push({
        id: `RESP-${crypto.randomUUID()}`,
        name,
        email: emails[index] ?? "",
      });
    });
  }

  if (pending.length) await db.insert(responsibles).values(pending).onConflictDoNothing();
}

async function ensurePhoneDirectoryImport() {
  const db = getDb();
  const [completed] = await db.select({ key: appMeta.key }).from(appMeta)
    .where(eq(appMeta.key, RESPONSIBLE_DIRECTORY_IMPORT_KEY)).limit(1);
  if (completed) return;

  let updated = 0;
  for (const item of responsibleDirectoryImport) {
    const result = await db.update(responsibles).set({
      position: item.position,
      phone: item.phone,
      updatedAt: new Date().toISOString(),
    }).where(eq(responsibles.name, item.name));
    if (result.meta.changes) updated += result.meta.changes;
  }
  await db.insert(appMeta).values({
    key: RESPONSIBLE_DIRECTORY_IMPORT_KEY,
    value: JSON.stringify({ source: RESPONSIBLE_DIRECTORY_SOURCE, exactMatches: responsibleDirectoryImport.length, updated }),
  }).onConflictDoNothing();
}

export async function GET() {
  try {
    await importTaskOwners();
    await ensurePhoneDirectoryImport();
    const rows = await getDb().select().from(responsibles).orderBy(asc(responsibles.name));
    return Response.json({ responsibles: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось загрузить справочник" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Partial<typeof responsibles.$inferInsert>;
    const name = payload.name?.trim();
    if (!name) return Response.json({ error: "Укажите ФИО ответственного" }, { status: 400 });
    const current = await getDb().select().from(responsibles);
    if (current.some((item) => item.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"))) {
      return Response.json({ error: "Такой ответственный уже есть в справочнике" }, { status: 409 });
    }
    const [responsible] = await getDb().insert(responsibles).values({
      id: `RESP-${crypto.randomUUID()}`,
      name,
      position: payload.position?.trim() ?? "",
      email: payload.email?.trim() ?? "",
      phone: payload.phone?.trim() ?? "",
    }).returning();
    const [deletedRow] = await getDb().select({ value: appMeta.value }).from(appMeta).where(eq(appMeta.key, DELETED_RESPONSIBLES_KEY)).limit(1);
    const deleted = new Set<string>(deletedRow ? JSON.parse(deletedRow.value) : []);
    deleted.delete(name.toLocaleLowerCase("ru"));
    await getDb().insert(appMeta).values({ key: DELETED_RESPONSIBLES_KEY, value: JSON.stringify([...deleted]) })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: JSON.stringify([...deleted]), updatedAt: new Date().toISOString() } });
    return Response.json({ responsible }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось добавить ответственного" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Не указан ID" }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select().from(responsibles).where(eq(responsibles.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Ответственный не найден" }, { status: 404 });
    const [deletedRow] = await db.select({ value: appMeta.value }).from(appMeta).where(eq(appMeta.key, DELETED_RESPONSIBLES_KEY)).limit(1);
    const deleted = new Set<string>(deletedRow ? JSON.parse(deletedRow.value) : []);
    deleted.add(existing.name.toLocaleLowerCase("ru"));
    await db.insert(appMeta).values({ key: DELETED_RESPONSIBLES_KEY, value: JSON.stringify([...deleted]) })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: JSON.stringify([...deleted]), updatedAt: new Date().toISOString() } });
    await db.delete(responsibles).where(eq(responsibles.id, id));
    const assignedTasks = await db.select({ id: tasks.id }).from(tasks).where(sql`${tasks.owner} LIKE ${`%${existing.name}%`}`);
    return Response.json({ ok: true, assignedTaskCount: assignedTasks.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось удалить ответственного" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as Partial<typeof responsibles.$inferInsert>;
    if (!payload.id) return Response.json({ error: "Не указан ID" }, { status: 400 });
    const [existing] = await getDb().select().from(responsibles).where(eq(responsibles.id, payload.id)).limit(1);
    if (!existing) return Response.json({ error: "Ответственный не найден" }, { status: 404 });
    const name = payload.name?.trim() || existing.name;
    const current = await getDb().select().from(responsibles);
    if (current.some((item) => item.id !== existing.id && item.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"))) {
      return Response.json({ error: "Такой ответственный уже есть в справочнике" }, { status: 409 });
    }
    const [responsible] = await getDb().update(responsibles).set({
      name,
      position: payload.position?.trim() ?? existing.position,
      email: payload.email?.trim() ?? existing.email,
      phone: payload.phone?.trim() ?? existing.phone,
      updatedAt: new Date().toISOString(),
    }).where(eq(responsibles.id, existing.id)).returning();

    const directoryRows = await getDb().select().from(responsibles);
    const taskRows = await getDb().select().from(tasks);
    const changedTasks: Array<typeof tasks.$inferSelect> = [];
    for (const task of taskRows) {
      const names = splitPeople(task.owner);
      const ownerIndex = names.findIndex((item) => item.toLocaleLowerCase("ru") === existing.name.toLocaleLowerCase("ru"));
      if (ownerIndex < 0) continue;
      names[ownerIndex] = responsible.name;
      const emails = names.map((person) => directoryRows.find((item) => item.name === person)?.email ?? "").filter(Boolean);
      const updatedAt = new Date().toISOString();
      const owner = names.join("; ");
      const ownerEmail = emails.join("; ");
      await getDb().update(tasks).set({
        owner,
        ownerEmail,
        updatedAt,
      }).where(eq(tasks.id, task.id));
      changedTasks.push({ ...task, owner, ownerEmail, updatedAt });
    }
    await Promise.all(changedTasks.map(({ historyJson, ...task }) => enqueueGoogleSync({
      action: "upsert",
      task: { ...task, history: JSON.parse(historyJson) },
    })));
    if (changedTasks.length) scheduleGoogleSheetsSync();
    const googleSync = await getGoogleSyncStatus();
    return Response.json({ responsible, googleSync });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить изменения" }, { status: 500 });
  }
}
