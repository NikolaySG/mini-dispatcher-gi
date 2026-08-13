import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  owner: text("owner").notNull(),
  ownerEmail: text("owner_email").notNull().default(""),
  status: text("status").notNull().default("В работе"),
  priority: text("priority").notNull().default("Средний"),
  due: text("due").notNull(),
  created: text("created").notNull(),
  author: text("author").notNull().default("Главный инженер"),
  project: text("project").notNull().default("Без объекта"),
  historyJson: text("history_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const responsibles = sqliteTable("responsibles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: text("position").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const googleSyncQueue = sqliteTable("google_sync_queue", {
  taskId: text("task_id").primaryKey(),
  version: text("version").notNull(),
  action: text("action").notNull(),
  payloadJson: text("payload_json").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_google_sync_queue_updated_at").on(table.updatedAt),
]);
