import { and, asc, eq } from "drizzle-orm";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import { getDb } from "../../db";
import { appMeta, googleSyncQueue } from "../../db/schema";

export type SyncAction =
  | { action: "replaceAll"; tasks: unknown[] }
  | { action: "upsert"; task: unknown }
  | { action: "delete"; id: string };

export type GoogleSyncState = "online" | "pending" | "unavailable";
export type GoogleSyncStatus = {
  state: GoogleSyncState;
  pending: number;
  lastSync: string | null;
  lastError: string | null;
};

const GOOGLE_SYNC_STATUS_KEY = "google-sheets-sync-status-v2";

function isConfigured() {
  return Boolean(process.env.GOOGLE_SHEETS_SYNC_URL && process.env.GOOGLE_SHEETS_SYNC_SECRET);
}

export async function syncGoogleSheets(action: SyncAction): Promise<"online" | "unavailable"> {
  const url = process.env.GOOGLE_SHEETS_SYNC_URL;
  const secret = process.env.GOOGLE_SHEETS_SYNC_SECRET;
  if (!url || !secret) return "unavailable";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, ...action }),
      redirect: "follow",
      cache: "no-store",
    });
    if (!response.ok) return "unavailable";
    const payload = await response.json() as { ok?: boolean };
    return payload.ok ? "online" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function enqueueGoogleSync(action: Exclude<SyncAction, { action: "replaceAll" }>) {
  const now = new Date().toISOString();
  const taskId = action.action === "delete" ? action.id : String((action.task as { id?: string }).id ?? "");
  if (!taskId) throw new Error("Не определено поручение для синхронизации");

  await getDb().insert(googleSyncQueue).values({
    taskId,
    version: crypto.randomUUID(),
    action: action.action,
    payloadJson: JSON.stringify(action),
    attempts: 0,
    lastError: "",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: googleSyncQueue.taskId,
    set: {
      version: crypto.randomUUID(),
      action: action.action,
      payloadJson: JSON.stringify(action),
      attempts: 0,
      lastError: "",
      updatedAt: now,
    },
  });
}

async function writeSyncStatus(lastSync: string | null, lastError: string | null) {
  const now = new Date().toISOString();
  const value = JSON.stringify({ lastSync, lastError });
  await getDb().insert(appMeta).values({ key: GOOGLE_SYNC_STATUS_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: appMeta.key, set: { value, updatedAt: now } });
}

export async function getGoogleSyncStatus(): Promise<GoogleSyncStatus> {
  const db = getDb();
  const [queue, statusRows] = await Promise.all([
    db.select({ attempts: googleSyncQueue.attempts, lastError: googleSyncQueue.lastError }).from(googleSyncQueue),
    db.select({ value: appMeta.value }).from(appMeta).where(eq(appMeta.key, GOOGLE_SYNC_STATUS_KEY)).limit(1),
  ]);
  let stored: { lastSync?: string | null; lastError?: string | null } = {};
  try { stored = statusRows[0] ? JSON.parse(statusRows[0].value) : {}; } catch { stored = {}; }
  const queueError = queue.find((item) => item.attempts > 0)?.lastError || null;
  return {
    state: !isConfigured() ? "unavailable" : queue.length ? "pending" : stored.lastError ? "unavailable" : "online",
    pending: queue.length,
    lastSync: stored.lastSync ?? null,
    lastError: queueError ?? stored.lastError ?? null,
  };
}

export async function flushGoogleSyncQueue(): Promise<GoogleSyncStatus> {
  const db = getDb();
  if (!isConfigured()) return getGoogleSyncStatus();
  const queued = await db.select().from(googleSyncQueue).orderBy(asc(googleSyncQueue.updatedAt)).limit(50);
  let lastSuccess: string | null = null;
  let lastError: string | null = null;

  for (const item of queued) {
    let action: SyncAction;
    try {
      action = JSON.parse(item.payloadJson) as SyncAction;
    } catch {
      await db.delete(googleSyncQueue).where(and(eq(googleSyncQueue.taskId, item.taskId), eq(googleSyncQueue.version, item.version)));
      continue;
    }
    const result = await syncGoogleSheets(action);
    if (result === "online") {
      lastSuccess = new Date().toISOString();
      await db.delete(googleSyncQueue).where(and(eq(googleSyncQueue.taskId, item.taskId), eq(googleSyncQueue.version, item.version)));
    } else {
      lastError = "Google Sheets временно недоступен";
      await db.update(googleSyncQueue).set({
        attempts: item.attempts + 1,
        lastError,
      }).where(and(eq(googleSyncQueue.taskId, item.taskId), eq(googleSyncQueue.version, item.version)));
      break;
    }
  }

  if (lastSuccess || lastError) await writeSyncStatus(lastSuccess, lastError);
  return getGoogleSyncStatus();
}

export async function forceGoogleSheetsSync(tasks: unknown[]): Promise<GoogleSyncStatus> {
  const result = await syncGoogleSheets({ action: "replaceAll", tasks });
  if (result === "online") {
    const now = new Date().toISOString();
    await getDb().delete(googleSyncQueue);
    await writeSyncStatus(now, null);
  } else {
    await writeSyncStatus(null, "Google Sheets временно недоступен");
  }
  return getGoogleSyncStatus();
}

export function scheduleGoogleSheetsSync() {
  const context = getRequestExecutionContext();
  if (context) context.waitUntil(flushGoogleSyncQueue());
}
