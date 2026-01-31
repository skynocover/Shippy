ALTER TABLE `projects` ADD `custom_domain` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `domain_status` text;--> statement-breakpoint
ALTER TABLE `users` ADD `cloudflare_token` text;