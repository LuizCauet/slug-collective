# First-time member setup

After a new member signs in with Discord and a valid club invite, show focused music setup before People, Create, Inbox or Profile. The first step uses the club brand, one heading, the shared artist picker, a count toward three artists, and a Continue button. Neither setup step shows the member navigation. Sign out remains available.

Members choose at least **three distinct artists** using the same live autocomplete and custom-name entry available in Profile. Names are compared after case/whitespace normalization, so duplicate spellings do not satisfy the minimum. Niche artists do not need to exist in either provider catalog. Existing autocomplete caching, keyboard support and provider-failure fallback apply here too.

Continue stays disabled below the minimum. The next step asks about genres and is optional. Members can pick suggestions, enter a custom genre, go back to their artists, or skip genres. Allow up to ten distinct genres, with at most 40 characters per name. No genre choice is required to join.

Finishing setup saves the artist and genre choices and marks onboarding complete on the server before showing People. Skipping genres completes setup with no genres selected. A failed save keeps the choices visible and shows an inline error. Refreshing or signing in on another device must not bypass an incomplete account's setup. Once complete, members can edit artists and genres in Profile without repeating onboarding.

Existing accounts are grandfathered into the completed state when the requirement is introduced. They keep their profiles and current access even if they have fewer than three artists. Future accounts start incomplete and must finish setup. Account status is stored on the server; a browser-only flag is not sufficient enforcement.

The first-time flow asks only for music preferences. Creative roles, collaboration opt-in, biography and other profile details stay optional and available later. This keeps the first visit short while giving People matching enough information to begin.

Genres add profile context. They do not change the current artist-based matching weights or the complementary-role score in Create.
