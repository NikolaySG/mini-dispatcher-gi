CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`owner` text NOT NULL,
	`owner_email` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'В работе' NOT NULL,
	`priority` text DEFAULT 'Средний' NOT NULL,
	`due` text NOT NULL,
	`created` text NOT NULL,
	`author` text DEFAULT 'Главный инженер' NOT NULL,
	`project` text DEFAULT 'Без объекта' NOT NULL,
	`history_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
