type SyncAction =
  | { action: "replaceAll"; tasks: unknown[] }
  | { action: "upsert"; task: unknown }
  | { action: "delete"; id: string };

export type GoogleSyncState = "online" | "unavailable";

export async function syncGoogleSheets(action: SyncAction): Promise<GoogleSyncState> {
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
