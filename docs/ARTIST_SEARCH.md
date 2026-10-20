# Artist autocomplete

Manual artist entry searches the MusicBrainz artist catalog with Apple artist search as a fallback through an authenticated server endpoint. The browser shows local suggestions immediately, debounces remote requests, and keeps custom entry available when a name is missing or the provider is unavailable. Selected artists remain editable and use the same profile-save flow.

Only the typed artist query is sent to MusicBrainz and, if its lookup fails or returns no artists, Apple. No member identifier, profile, message, or listening history is forwarded. Shared query results are cached in D1 for seven days. The app schedules upstream requests at least 1.1 seconds apart using a database reservation across Worker instances, sends a meaningful User-Agent, and uses bounded requests. Cached results avoid repeated upstream calls. Apple fallback requests have a separate shared 20-per-minute budget. Both fetches use manual redirect handling supported by Cloudflare Workers and reject redirects rather than forwarding requests. Search requires no additional member account or API key.

Artist names remain the matching key in this baseline. Suggestions with the same normalized display name are collapsed; this does not establish that unrelated artists sharing a name are the same MusicBrainz entity. A future identity-aware matching model can retain MBIDs across all import sources.

MusicBrainz and Apple attribution appears beside search. References:
- https://musicbrainz.org/doc/MusicBrainz_API/Search
- https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
- https://musicbrainz.org/doc/About/Data_License

- https://performance-partners.apple.com/search-api

## Cache strategy

For the club, extend the existing shared cache instead of downloading a full worldwide artist database. The browser catalog stores at most 500 public artist suggestions from successful searches, with a 30-day lifetime. It contains only artist IDs, names, descriptions and cache timestamps; never member profiles, messages, listening history, access tokens or raw uploads. Expired suggestions are removed, duplicate normalized artist names are merged, and the oldest entries are evicted when the cap is exceeded. Browser storage being disabled, full or corrupt must not prevent manual entry or live search.

Use these layers together:

1. Show matching suggestions from the browser catalog immediately while the member types. An exact, unexpired artist-name match can be reused without contacting the providers. A partial match is only an instant suggestion, not proof that the catalog contains every matching artist.
2. Reuse the authenticated endpoint's seven-day shared D1 cache for the same normalized query across members and devices. An exact artist already returned in an unexpired shared result can also be reused without another provider call; this lookup examines at most the newest 1,000 fresh cache rows.
3. When neither layer resolves the lookup, debounce and perform live MusicBrainz search, with Apple artist search as the fallback. Successful results refresh the browser catalog and shared query cache. Provider failures must remain errors, not be stored as successful empty results.

This reduces repeat lookups and makes familiar artists feel instant. **A first-ever lookup still needs a network request.** This is not a complete offline catalog; storage eviction, expiration, a new device, or an artist nobody has searched can require another live lookup. Arbitrary custom artist entry remains available. Exact-name reuse avoids a request only for an actual known artist name; a cached prefix must not be reused as though it were an exhaustive result for a longer query.

The server retains provider safeguards even with caching: shared MusicBrainz reservations at least 1.1 seconds apart, a separate Apple fallback budget of 20 requests per minute, bounded provider responses and timeouts, and browser debouncing. Those quotas apply to provider cache misses, not each keystroke. Browser suggestions are a UX optimization; they do not grant access to member data or bypass endpoint authentication.

## Why not a full dump now?

MusicBrainz publishes downloadable database snapshots and separate JSON entity dumps. The [official artist JSON dump dated October 17, 2026](https://ftp.musicbrainz.org/pub/musicbrainz/data/json-dumps/20261017-001001/) lists `artist.tar.xz` at approximately **2 GB compressed**. That is not an appropriate browser download for a small club. It also requires extraction, selecting fields and aliases, building a searchable index, hosting it and keeping it current. The archive size does not represent the size of a future names-only derived index; that would need measurement after preprocessing.

A periodically refreshed, server-hosted artist-name index could be useful if measured usage consistently exhausts the cache and live quotas. It would be a separate data pipeline, with licensing and attribution reviewed for the chosen fields. It would not automatically fix artists absent from MusicBrainz, so Apple fallback and custom names would still matter. For the current club scale, the bounded local catalog and shared cache address repeat latency with much less operational work.

Primary documentation: [database download formats](https://musicbrainz.org/doc/MusicBrainz_Database/Download), [MusicBrainz rate limits](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), [data licenses](https://musicbrainz.org/doc/About/Data_License), and [Apple search limits and caching guidance](https://performance-partners.apple.com/search-api).
