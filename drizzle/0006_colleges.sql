CREATE TABLE `colleges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`state` text,
	`ambassador_id` text,
	`ambassador_since` integer,
	`certificate_sent_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`ambassador_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `colleges_name_idx` ON `colleges` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `colleges_ambassador_idx` ON `colleges` (`ambassador_id`);