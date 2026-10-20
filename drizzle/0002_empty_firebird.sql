ALTER TABLE `users` ADD `spotify_artists` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `spotify_imported_at` integer;