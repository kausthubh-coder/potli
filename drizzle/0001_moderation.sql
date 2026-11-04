CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_window_start_idx` ON `rate_limits` (`window_start`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`package_name` text NOT NULL,
	`version` text,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`reporter_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`package_name`) REFERENCES `packages`(`name`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`);--> statement-breakpoint
ALTER TABLE `packages` ADD `taken_down_at` integer;--> statement-breakpoint
ALTER TABLE `packages` ADD `taken_down_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `versions` ADD `taken_down_at` integer;--> statement-breakpoint
ALTER TABLE `versions` ADD `taken_down_by` text REFERENCES user(id);