CREATE TABLE events (
 id TEXT PRIMARY KEY, creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 title TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '', preferred_size INTEGER NOT NULL DEFAULT 2 CHECK(preferred_size>=2),
 phase TEXT NOT NULL DEFAULT 'lobby', joining_open INTEGER NOT NULL DEFAULT 1,
 version INTEGER NOT NULL DEFAULT 0, roster_revision INTEGER NOT NULL DEFAULT 0,
 draft TEXT, draft_roster INTEGER, published TEXT, published_revision INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, ended_at INTEGER
);
--> statement-breakpoint
CREATE TABLE event_attendees (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'active', joined_at INTEGER NOT NULL,
 PRIMARY KEY(event_id,user_id)
);
--> statement-breakpoint
CREATE TABLE event_tastes (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 revision TEXT NOT NULL, artists TEXT NOT NULL, genres TEXT NOT NULL,
 PRIMARY KEY(event_id,user_id,revision)
);
--> statement-breakpoint
CREATE TRIGGER event_join AFTER INSERT ON event_attendees BEGIN
 UPDATE events SET roster_revision=roster_revision+1,version=version+1 WHERE id=NEW.event_id;
END;
--> statement-breakpoint
CREATE TRIGGER event_attendance_change AFTER UPDATE OF status ON event_attendees WHEN OLD.status<>NEW.status BEGIN
 UPDATE events SET roster_revision=roster_revision+1,version=version+1 WHERE id=NEW.event_id;
END;
--> statement-breakpoint
CREATE TRIGGER event_attendance_delete AFTER DELETE ON event_attendees BEGIN
 UPDATE events SET roster_revision=roster_revision+1,version=version+1 WHERE id=OLD.event_id;
END;
--> statement-breakpoint
ALTER TABLE oauth_states ADD COLUMN return_path TEXT;
