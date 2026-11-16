CREATE TABLE `intern_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`note` text,
	`certificate_sent_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `intern_codes_email_idx` ON `intern_codes` (`email`);--> statement-breakpoint
ALTER TABLE `posts` ADD `intern_code` text;--> statement-breakpoint
CREATE INDEX `posts_intern_code_idx` ON `posts` (`intern_code`);