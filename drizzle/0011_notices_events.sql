CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text NOT NULL,
	`cover_image` text,
	`link` text,
	`link_label` text,
	`location` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`published` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_starts_idx` ON `events` (`published`,`starts_at`);--> statement-breakpoint
CREATE TABLE `notices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link` text,
	`sender` text NOT NULL,
	`audience` text NOT NULL,
	`recipients` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
