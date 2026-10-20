# Discord setup

1. Open https://discord.com/developers/applications and create an application named Slug Collective.
2. In OAuth2, add both redirect URLs exactly:
   - http://127.0.0.1:5174/auth/discord/callback
   - https://beta.slugcollective.workers.dev/auth/discord/callback
3. Copy the OAuth2 Client ID and Client Secret into DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in the ignored .dev.vars file. Never paste the secret into chat or commit it. No bot token is used.
4. Enable Developer Mode in your Discord settings, copy your own user ID, and put it in ADMIN_DISCORD_IDS. Multiple admins use comma-separated Discord IDs.
5. Set INITIAL_INVITE_CODE to a long random value for the first member. Join using http://127.0.0.1:5174/?invite=YOUR_VALUE. Keep this value private. The production first-member link uses the hosted origin. After an admin signs in, create expiring invites from Profile, then remove the bootstrap secret from production.
6. Tell Codex the local file is ready. It can configure the hosted runtime securely without printing the values. APP_ORIGIN must be changed to the hosted origin for production, without a trailing slash.

The application asks only for Discord identify scope, not email, server access, or existing DMs. App invites are separate from the club Discord server invite. Invite access does not automatically verify continuing server membership.

Official reference: https://docs.discord.com/developers/topics/oauth2

