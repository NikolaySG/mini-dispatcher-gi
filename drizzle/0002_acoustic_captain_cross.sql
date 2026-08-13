CREATE TABLE `responsibles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
