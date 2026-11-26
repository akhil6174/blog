CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`photo` text,
	`role` text,
	`college` text,
	`period` text,
	`summary` text,
	`github` text,
	`linkedin` text,
	`website` text,
	`highlight_url` text,
	`highlight_label` text,
	`published` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 100 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `people_kind_idx` ON `people` (`kind`,`published`,`sort`);