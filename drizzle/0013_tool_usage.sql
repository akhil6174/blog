CREATE TABLE `tool_usage` (
	`day` text NOT NULL,
	`tool` text NOT NULL,
	`action` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `tool`, `action`)
);
