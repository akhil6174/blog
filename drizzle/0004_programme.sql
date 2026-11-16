CREATE TABLE `applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`track` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`college` text,
	`interests` text,
	`sample_url` text,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `applications_status_idx` ON `applications` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`user_id` text NOT NULL,
	`post_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `post_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `competition_entries` (
	`month` text NOT NULL,
	`post_id` text NOT NULL,
	`author_id` text NOT NULL,
	`upvotes` integer DEFAULT 0 NOT NULL,
	`suspicious_votes` integer DEFAULT 0 NOT NULL,
	`accuracy` integer,
	`quality` integer,
	`originality` integer,
	`clarity` integer,
	`score` integer,
	`rank` integer,
	`prize` integer DEFAULT 0 NOT NULL,
	`disqualified` integer DEFAULT false NOT NULL,
	`note` text,
	PRIMARY KEY(`month`, `post_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competition_entries_author_idx` ON `competition_entries` (`author_id`);--> statement-breakpoint
CREATE TABLE `competitions` (
	`month` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`finalised_at` integer,
	`published_at` integer,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`link` text,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`month` text,
	`post_id` text,
	`payment_ref` text,
	`paid_at` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rewards_user_idx` ON `rewards` (`user_id`);--> statement-breakpoint
CREATE INDEX `rewards_status_idx` ON `rewards` (`status`);--> statement-breakpoint
ALTER TABLE `comments` ADD `edited_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `college` text;--> statement-breakpoint
ALTER TABLE `user` ADD `interests` text;