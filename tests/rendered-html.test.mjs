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
  assert.match(page, /downloadTasksXlsx/);
  assert.match(page, /Скрыть выполненные/);
  assert.match(page, /completionModal/);
  assert.match(page, /completedAt/);
  assert.match(page, /OperationsPanels/);
  assert.match(tasksRoute, /enqueueGoogleSync/);
  assert.match(tasksRoute, /scheduleGoogleSheetsSync/);
  assert.match(tasksRoute, /nextCompletedAt/);
  assert.match(tasksRoute, /Фактическая дата исполнения/);
  assert.match(sync, /replaceAll/);
  assert.match(sync, /upsert/);
  assert.match(sync, /delete/);
});

test("replaces the digital header clock with an analog clock and flip calendar", async () => {
  const [page, component, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/analog-calendar-clock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /AnalogCalendarClock/);
  assert.doesNotMatch(page, /formatSystemTime\(clock\)/);
  assert.match(component, /Europe\/Saratov/);
  assert.match(component, /analog-clock/);
  assert.match(component, /flip-calendar/);
  assert.match(css, /\.analog-clock/);
  assert.match(css, /@keyframes calendar-flip/);
});

test("adds persistent, transparent executor karma", async () => {
  const [page, css, schema, route, karma] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/karma.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /KarmaDashboard/);
  assert.match(page, /Не учитывать в карме/);
  assert.match(css, /\.karma-stage/);
  assert.match(schema, /karmaExcluded/);
  assert.match(route, /nextKarmaExcluded/);
  assert.match(karma, /volumeCap: 10/);
  assert.match(karma, /onTimeCompletion: 6/);
  assert.match(karma, /overdue: -9/);
  assert.match(karma, /transfer: -3/);
  assert.match(karma, /CONFIRMED_OWNER_ALIASES/);
  assert.match(karma, /identityIndex\.get\(ownerLookupKey\(owner\)\)/);
  assert.match(karma, /taskIdentityIds = new Set<string>/);
  assert.match(karma, /findCompletionTime\(task\.completedAt, task\.history\)/);
  assert.match(karma, /completedAt\?: string/);
  assert.match(page, /identities=\{responsibles\}/);
});

test("exports selected tasks as Excel with an executor comment column", async () => {
  const exchange = await readFile(new URL("../app/services/task-exchange.ts", import.meta.url), "utf8");
  assert.match(exchange, /Комментарий исполнителя/);
  assert.match(exchange, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(exchange, /downloadTasksXlsx/);
});
