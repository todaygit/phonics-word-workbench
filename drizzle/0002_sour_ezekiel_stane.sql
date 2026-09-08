CREATE TABLE `planted_trees` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`tree_id` text NOT NULL,
	`tree_name` text NOT NULL,
	`cost` integer NOT NULL,
	`planted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_planted_user_request` ON `planted_trees` (`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `idx_planted_user_time` ON `planted_trees` (`user_id`,`planted_at`);