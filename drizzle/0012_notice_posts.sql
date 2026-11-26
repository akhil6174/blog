ALTER TABLE `notices` ADD `post_id` text;--> statement-breakpoint
ALTER TABLE `notices` ADD `kind` text DEFAULT 'message' NOT NULL;