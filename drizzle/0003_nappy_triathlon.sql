CREATE TABLE `artist_search_cache` (
	`query` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`expires_at` integer NOT NULL
);
