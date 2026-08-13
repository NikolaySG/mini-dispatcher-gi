import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the dispatcher product shell and responsible directory", async () => {
  const [page, css, schema, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/responsibles/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Справочник ответственных/);
  assert.match(page, /ResponsibleDirectory/);
  assert.match(page, /responsible-picker/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /splitPeople\(draft\.owner\)/);
  assert.match(css, /\.workspace-tabs/);
  assert.match(css, /\.directory-surface/);
  assert.match(css, /\.responsible-popup/);
  assert.match(schema, /sqliteTable\("responsibles"/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.match(page, /deleteResponsible/);
  assert.match(page, /Назначения в/);
  assert.match(css, /\.directory-delete/);
});

test("preserves existing task and Google Sheets workflows", async () => {
  const [page, tasksRoute, sync] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/services/google-sheets-sync.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /MeetingMode/);
  assert.match(page, /downloadTasksCsv/);
  assert.match(page, /OperationsPanels/);
  assert.match(tasksRoute, /syncGoogleSheets/);
  assert.match(sync, /replaceAll/);
  assert.match(sync, /upsert/);
  assert.match(sync, /delete/);
});
