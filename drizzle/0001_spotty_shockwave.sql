CREATE TABLE `learning_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`item_key` text NOT NULL,
	`label` text NOT NULL,
	`correct` integer NOT NULL,
	`points` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activity_user_event` ON `learning_activity` (`user_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_activity_user_day_item` ON `learning_activity` (`user_id`,`day`,`kind`,`item_key`);