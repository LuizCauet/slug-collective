ALTER TABLE `users` ADD `onboarding_completed_at` integer;
--> statement-breakpoint
UPDATE `users` SET `onboarding_completed_at` = CAST(strftime('%s','now') AS INTEGER) * 1000;
