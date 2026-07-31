import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

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
