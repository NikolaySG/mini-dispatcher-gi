CREATE TABLE `google_sync_queue` (
	`task_id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`action` text NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_google_sync_queue_updated_at` ON `google_sync_queue` (`updated_at`);