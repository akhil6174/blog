CREATE TABLE `dsa_progress` (
	`user_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`solved_at` integer,
	`revise` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `problem_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dsa_reports` (
	`user_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`company` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `problem_id`, `company`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dsa_reports_company_idx` ON `dsa_reports` (`company`);