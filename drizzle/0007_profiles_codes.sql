ALTER TABLE `colleges` ADD `ambassador_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `colleges_code_idx` ON `colleges` (`ambassador_code`);--> statement-breakpoint
ALTER TABLE `user` ADD `github` text;--> statement-breakpoint
ALTER TABLE `user` ADD `linkedin` text;