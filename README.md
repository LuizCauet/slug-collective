# Slug Collective demo

A mobile-first, buildless interactive prototype with fictional members and original local SVG assets. People and Create share one profile and inbox. No external runtime dependencies.

Run `python -m http.server 5173 --bind 127.0.0.1 --directory dist` from this folder and open http://127.0.0.1:5173. Run `npm test` for matching checks and `npm run check` for app syntax.

All demo data is stored under `slug-collective-demo-v1` in browser local storage. Reset it from Profile. Provider connections and replies are simulated; no credentials are collected. Artwork is illustrative and is not the named albums' official cover artwork.

Matching is deterministic, not trained ML: exact shared artists rank People, with inverse community-frequency weighting, while complementary roles add weight in Create. The separate `dist/matching.js` module is the replacement point for future recommendations.

Future work: real authentication, provider-authorized music imports, durable multi-user messaging, work uploads and playback, member moderation, and evaluated ML recommendations. This demo is independent of UC Santa Cruz and does not imply university endorsement.

Revision: black/yellow/purple visual identity and bold sans type. The album checklist is replaced by artist search with arbitrary custom entries. Matching normalizes artist names and weighs community overlap, not global artist popularity. Sample counts refer only to fictional members. Existing saved album selections migrate into artist names.

Discovery revision: compact People/Create controls replace headers and hero copy. People cards use local album covers from Apple catalog records, with source links stored in dist/music-art.js. On repeat demonstrates changing member listening posts; sharing replaces your one current local record, reactions persist, and Say hey carries the record/note into messages. Sample member posts remain fictional and static; this is not a real-time feed. Unknown artists or record titles use a generic music placeholder rather than unrelated cover art.

Current navigation: People, Create, Inbox, Profile, and an external Club Discord link (https://discord.gg/FtV5CYWHW3). On repeat, posting, and likes have been removed; club sharing stays on Discord. Legacy browser-local post/reaction data is ignored.
