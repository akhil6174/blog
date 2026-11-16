ALTER TABLE `posts` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `category` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `summary_source` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `summary_basis` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `featured` integer DEFAULT false NOT NULL;