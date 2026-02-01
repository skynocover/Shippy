ALTER TABLE `projects` ADD `description` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `is_public` integer DEFAULT true NOT NULL;