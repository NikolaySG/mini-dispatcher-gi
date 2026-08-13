import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { responsibles, tasks } from "../../../db/schema";
import { syncGoogleSheets } from "../../services/google-sheets-sync";

function splitPeople(value: string) {
  return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

async function importTaskOwners() {
  const db = getDb();
  const [current, taskRows] = await Promise.all([
    db.select().from(responsibles),
    db.select({ owner: tasks.owner, ownerEmail: tasks.ownerEmail }).from(tasks),
  ]);
  const known = new Set(current.map((item) => item.name.trim().toLocaleLowerCase("ru")));
  const pending: typeof responsibles.$inferInsert[] = [];

  for (const task of taskRows) {
    const names = splitPeople(task.owner);
    const emails = splitPeople(task.ownerEmail);
    names.forEach((name, index) => {
      const key = name.toLocaleLowerCase("ru");
      if (known.has(key)) return;
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

export async function GET() {
  try {
    await importTaskOwners();
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
    return Response.json({ responsible }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось добавить ответственного" }, { status: 500 });
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
    for (const task of taskRows) {
      const names = splitPeople(task.owner);
      const ownerIndex = names.findIndex((item) => item.toLocaleLowerCase("ru") === existing.name.toLocaleLowerCase("ru"));
      if (ownerIndex < 0) continue;
      names[ownerIndex] = responsible.name;
      const emails = names.map((person) => directoryRows.find((item) => item.name === person)?.email ?? "").filter(Boolean);
      await getDb().update(tasks).set({
        owner: names.join("; "),
        ownerEmail: emails.join("; "),
        updatedAt: new Date().toISOString(),
      }).where(eq(tasks.id, task.id));
    }
    const syncedRows = await getDb().select().from(tasks).orderBy(asc(tasks.id));
    const googleSync = await syncGoogleSheets({ action: "replaceAll", tasks: syncedRows.map(({ historyJson, ...task }) => ({
      ...task,
      history: JSON.parse(historyJson),
    })) });
    return Response.json({ responsible, googleSync });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить изменения" }, { status: 500 });
  }
}
