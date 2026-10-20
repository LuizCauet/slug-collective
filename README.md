# Slug Collective

A mobile-first member app for the UCSC Slug Collective: music-based People discovery, opt-in Create directory, and private in-app conversations. Independent of UC Santa Cruz.

## Run locally

Requires Node 20+. Run npm install, then npm run dev. Open http://127.0.0.1:5174. Copy .env.example to .dev.vars and follow docs/DISCORD_SETUP.md. Real sign-in requires Discord credentials; there is no production auth bypass. Local D1 data persists under ignored .mf/. npm run build bundles the Worker and local assets; npm test runs backend/music integration tests.

## Architecture

- web/: browser interface, local bundled artwork, deterministic matching.
- server/: Discord OAuth, hashed cookie sessions, D1 member/message APIs, ListenBrainz import.
- db/ and drizzle/: schema and immutable generated migrations.
- scripts/: dependency-based build and Miniflare development server.
- .openai/hosting.json: existing Sites identity and logical DB binding. Secrets belong in the hosted environment, never this manifest.

Members appear in People after joining. Create requires both an explicit collaboration opt-in and at least one creative role. Work links are optional. Members can manually add niche artists or verify their ListenBrainz account with a one-use token; the token is discarded. Listening history on ListenBrainz is public. Imported aggregate artist lists can be disconnected independently of manual choices.

## Current limits

Matching uses normalized shared artists weighted by their frequency within this community, plus complementary roles for Create. It is an explainable baseline, not trained ML. Recommendation feedback is stored for later evaluation. Real Spotify/Apple Music imports, uploads/playback, notifications, and evaluated trained recommendations are future work. Messages use polling while the inbox is visible. A club pilot should define moderation/report retention expectations; see docs/SECURITY.md.

The login page can be public while member APIs require Discord login and a valid app invite for initial registration. Existing members can return without a new invite. No fictional members or simulated replies are inserted into the real database.
