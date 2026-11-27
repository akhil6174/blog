CREATE TABLE `notice_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notice_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`from_admin` integer DEFAULT false NOT NULL,
	`body` text NOT NULL,
	`seen_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`notice_id`) REFERENCES `notices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notice_replies_thread_idx` ON `notice_replies` (`notice_id`,`user_id`,`id`);