import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { tasks } from "../../../db/schema";
import { flushGoogleSyncQueue, forceGoogleSheetsSync, getGoogleSyncStatus } from "../../services/google-sheets-sync";

function serialize(row: typeof tasks.$inferSelect) {
  const { historyJson, ...task } = row;
  let history: unknown[] = [];
  try { history = JSON.parse(historyJson); } catch { history = []; }
  return { ...task, history };
}

export async function GET() {
  try {
    return Response.json(await getGoogleSyncStatus());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось получить состояние синхронизации" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { force?: boolean };
    if (payload.force) {
      const rows = await getDb().select().from(tasks).orderBy(asc(tasks.id));
      return Response.json(await forceGoogleSheetsSync(rows.map(serialize)));
    }
    return Response.json(await flushGoogleSyncQueue());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось синхронизировать Google Sheets" }, { status: 500 });
  }
}
