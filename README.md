# Slug Collective demo

A mobile-first, buildless interactive prototype with fictional members and original local SVG assets. People and Create share one profile and inbox. No external runtime dependencies.

Run `python -m http.server 5173 --bind 127.0.0.1 --directory dist` from this folder and open http://127.0.0.1:5173. Run `npm test` for matching checks and `npm run check` for app syntax.

All demo data is stored under `slug-collective-demo-v1` in browser local storage. Reset it from Profile. Provider connections and replies are simulated; no credentials are collected. Artwork is illustrative and is not the named albums' official cover artwork.

Matching is deterministic, not trained ML: shared albums rank People, while complementary roles add weight in Create. The separate `dist/matching.js` module is the replacement point for future recommendations.

Future work: real authentication, provider-authorized music imports, durable multi-user messaging, work uploads and playback, member moderation, and evaluated ML recommendations. This demo is independent of UC Santa Cruz and does not imply university endorsement.
