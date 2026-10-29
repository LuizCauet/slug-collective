# Security and privacy

Slug Collective is an invite-only community application. Its login page can be public; member profiles, listening preferences, and conversations must require an authenticated club member.

## Deployment requirements

- Configure Discord client credentials as Worker secrets. Never commit the client secret or put it in browser code.
- Set `APP_ORIGIN` to the exact HTTPS production origin and register its OAuth callback URL with Discord. Use a separate Discord application for local development where practical.
- Configure `INITIAL_INVITE_CODE` as a strong, private registration code and `ADMIN_DISCORD_IDS` as a comma-separated list of trusted Discord user IDs. A public Discord server invite is not an application membership secret.
- Bind the production D1 database and apply migrations before enabling sign-in. Keep test databases separate.
- Use HTTPS in production. Do not disable cookie, CSRF, or authorization checks to work around a deployment problem.

## Trust boundaries

Discord authentication proves control of a Discord identity; it does not by itself prove club membership. New members must also provide an application invite. OAuth state must bind authorization callbacks to the initiating browser. Sessions belong in HTTP-only cookies, and authenticated writes require CSRF protection.

Every conversation read and write must verify the current member participates in that conversation. A thread identifier is not authorization. The server validates submitted profile fields and decides whether a member is eligible for the Create directory; hiding a button in the browser is insufficient.

Member-provided names, biographies, music preferences, and messages are untrusted text. The UI must render them as text or escape them before inserting HTML. External work links must accept only supported HTTP(S) URLs. Avoid placing personal data, credentials, OAuth authorization codes, session cookies, or message content in application logs.

## Data and integrations

Listening connections are optional. Manual artist entry must remain available. Do not describe a public listening username as verified ownership unless an ownership-verification flow exists. Imports must identify their source, let members disconnect, and preserve manual choices deliberately. ListenBrainz history is public on the upstream service; explain this before asking a member to connect.

Do not send private messages, biographies, or member identifiers to a music service. Cache and limit upstream requests. Imported artist names remain untrusted input. No model training or third-party analytics should collect private community messages.

## Operational review

Before inviting members, test new registration, returning sign-in, invalid OAuth state, session expiry, denied anonymous requests, CSRF rejection, cross-member conversation isolation, and Create opt-in visibility. Review backup/restore, access removal, data deletion, incident contact, and account moderation before a broad launch. Current automated tests are evidence for the implemented scenarios, not a third-party security audit.

## Current implementation notes

- OAuth requests only Discord's `identify` scope. Access tokens are used for identity lookup and are not stored. OAuth state is single-use and expires after ten minutes.
- Session cookies are HTTP-only and SameSite=Lax; HTTPS requests receive Secure cookies. Sessions expire after thirty days. Session identifiers and invite codes are stored as SHA-256 hashes, not raw bearer values.
- State-changing API routes require both an exact same-origin header and a session CSRF token. API responses use `Cache-Control: no-store`.
- Create participation requires explicit opt-in and at least one supported role. Those members remain visible in People regardless of their Create choice.
- Blocking hides both members from each other's directory and prevents opening or sending messages in their conversation.
- Account deletion cascades through sessions, conversations, messages, blocks, and feedback. Moderation reports retain their reason and timestamp with deleted member references cleared; report text may therefore still contain personal information supplied by its author. Administrators need a retention/removal policy for these reports before broad launch.
- ListenBrainz account ownership is verified by a user token. The token is sent only to the fixed ListenBrainz validation endpoint and is not persisted. Stored integration data consists of the verified username, imported artist names/identifiers/play counts, and sync timestamp. Disconnecting removes imported data while preserving manual artists.
- Backend integration tests run against the real D1 schema and app with a stubbed Discord provider. They do not establish that live Discord credentials, redirects, production database binding, or live ListenBrainz service setup are correct.


## Public source review — October 28, 2026

The publication review scanned all 42 commits reachable from the local branches and fetched GitHub refs before the showcase update, plus a clean export of tracked source, using checksum-verified Gitleaks 8.30.1. Neither scan detected secrets. A separate exact-value check compared the configured Discord client secret, bootstrap registration code, and admin ID list against 325 unique historical file blobs; it found no matches. Secret values were never printed or copied into reports.

Tracked paths contained no local environment files, runtime databases, private keys, raw listening archives, build output, or application logs. Environment examples contain blank credential fields. Published People/Create and event screenshots were checked against fictional local fixtures; no live member records or private conversations were exported for the showcase.

GitHub Actions now scans Git history with redacted output on pushes and pull requests. `npm run check:public` rejects tracked environment files, runtime databases, exports, private keys, logs, and build output. Additional ignore rules cover database sidecars and private key files. Infrastructure resource IDs in configuration are identifiers, not authentication credentials; actual credentials remain outside the source tree.

These checks cover the repository and its reachable history at review time. They do not inspect collaborators' unrelated machines, future commits, or third-party backups. If a real credential is ever exposed, revoke or rotate it before attempting history cleanup.
