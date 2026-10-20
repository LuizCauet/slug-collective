# Cloudflare deployment

Requires Node 22+ and a Cloudflare account. The app uses Workers Free and a D1 database; do not enable a paid plan for the club pilot.

## First deployment

1. Run `npx wrangler login` and approve the official Wrangler authorization.
2. Run `npx wrangler d1 create slug-collective`. Copy the returned database_id into the DB binding in wrangler.jsonc. This identifier is configuration, not a secret.
3. Run `npm run deploy`. This applies pending schema migrations, builds, and deploys the app. Note its workers.dev URL. Local and Sites data are separate; this new database starts empty.
4. With .dev.vars completed, run `npm run cloudflare:secrets -- https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev`. The helper sends the six required values directly to Wrangler over stdin. It prints no secret values and never edits the local origin.
5. In the Discord developer portal, add `https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev/auth/discord/callback` as an OAuth2 redirect. Keep the local callback for development.
6. Join the hosted app using the current INITIAL_INVITE_CODE in .dev.vars. Once signed in as an admin, create expiring app invites in Profile and remove the bootstrap secret with `npx wrangler secret delete INITIAL_INVITE_CODE`.

## Automatic GitHub deployment

In Cloudflare Workers & Pages, connect LuizCauet/slug-collective and choose main. Build command: `npm run build`. Deploy command: `npm run deploy`. The Worker name must match slug-collective in wrangler.jsonc. Set NODE_VERSION to 22 or newer in the build settings. Database migrations run before Worker deployment; this repository uses additive, schema-only migrations. Do not place .dev.vars or Discord secrets into GitHub or build variables; the secret helper configures production runtime secrets directly.

## Checks

- `/api/health`: 200.
- `/api/config`: discordConfigured true after secrets are set.
- `/api/me`: authenticated false when signed out.
- `/api/members`: 401 when signed out.
- Test first-member registration, returning login, profile persistence, and two-member messaging with the hosted callback.

No local member records, conversations, or sessions are copied automatically. Use hosted accounts for the club launch. The older Sites demo remains separate while the Cloudflare deployment is verified.

Current production: https://slug-collective.slug-collective.workers.dev
Discord callback: https://slug-collective.slug-collective.workers.dev/auth/discord/callback
The DB binding in wrangler.jsonc points to the club database in the authorized Cloudflare account. Runtime secret values are stored in Cloudflare only, with local development values remaining in ignored .dev.vars.
