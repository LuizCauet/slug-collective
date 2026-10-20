# Spotify export import

Profile contains an optional Connect services section. Import a Spotify ZIP directly, or select the extracted streaming-history JSON files together. Standard Account Data history and Extended Streaming History are supported. Members can continue using manual artists and ListenBrainz independently.

The browser reads and aggregates the history inside a dedicated worker. It previews up to 200 artists; members can remove artists before saving. Only the approved names and play/time totals are sent to the authenticated API. Raw archives, track-by-track history, account files, IP addresses, device details, and history date bounds are not stored by the app. Spotify imports can be replaced or removed without deleting manual artists or ListenBrainz imports.

Spotify exports are snapshots and do not sync automatically. Requesting an export is handled by Spotify and may take time. The interface links to Spotify Account Privacy and keeps those instructions collapsed.

Archive size and expansion limits protect browser memory. Unsupported files and archives without qualifying music history give actionable errors. The import excludes short plays, podcasts identified by Spotify fields, and explicitly private-session records. Community matching continues to use shared artist names, with greater weight for artists shared by fewer members; imported play counts are not presented as global popularity.

Reference: https://support.spotify.com/us/article/understanding-your-data/
