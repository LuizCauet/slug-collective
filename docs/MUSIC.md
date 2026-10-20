# ListenBrainz connection

The server verifies a user-owned ListenBrainz token once through `GET /1/validate-token`, then imports at most 200 all-time artist aggregates through `GET /1/stats/user/{username}/artists`. The token goes only in the validation request's Authorization header. Never log, persist, return, or put this token in a URL. The application stores the verified username, artist aggregates, and sync timestamp, not the token.

Before connection, obtain explicit consent to read the public listening profile and make imported artist preferences visible to other club members. ListenBrainz listening records are public independently of this application. The caller must require an authenticated member session for connect/sync/disconnect, enforce ownership of the stored username, and rate-limit user-triggered syncs. Do not expose an arbitrary username proxy or treat a username alone as proof of ownership. Disconnect deletes imported data while preserving manually entered artists.

`connectListenBrainz({token, userAgent})` and `syncListenBrainz({username, userAgent})` return `{username, artists: [{name, mbid, plays}], lastSyncedAt}`. The timestamp is epoch milliseconds. A 204 statistics response produces an empty list; it does not invent artists. Empty profiles can keep using manual artist entry. Sync should replace the imported snapshot atomically only after success. Failed syncs should retain the previous snapshot and expose the `MusicError.message` plus `retryAfter` when present.

Requests time out after ten seconds and share a one-request-per-second limiter per worker isolate. The queue rejects reservations exceeding five seconds, rather than waiting indefinitely. A production deployment with multiple worker isolates should additionally enforce account-level cooldowns in the database and, if needed, a coordinated provider limiter. No immediate retries occur on 429; callers should honor `retryAfter` seconds.

The optional `fetcher`, `limiter`, and `timeoutMs` arguments support deterministic testing. Production should supply a descriptive `userAgent` with an actual application contact URL. Tests run using `node --test tests/music.test.js` and make no network requests.

This imports existing ListenBrainz statistics. It does not directly connect Spotify/Apple Music or recover missing historical listens. Users configure their listening source within ListenBrainz. A seamless embedded connect-services OAuth scope requires MetaBrainz approval and is outside this connector. No recordings or audio are downloaded or used to train a model.

Official references:

- [Token verification](https://listenbrainz.readthedocs.io/en/latest/users/api/core.html) (see GET /1/validate-token)
- [Artist statistics](https://listenbrainz.readthedocs.io/en/latest/users/api/statistics.html)
- [Rate limits and user agent](https://listenbrainz.readthedocs.io/en/latest/users/api/)
- [Music service connection approval](https://listenbrainz.readthedocs.io/en/latest/users/connect-music-services.html)
- [Public data downloads and licensing](https://listenbrainz.org/download/)
