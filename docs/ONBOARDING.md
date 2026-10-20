# First-time member setup

After a new member signs in with Discord and a valid club invite, show a focused artist setup page before People, Create, Inbox or Profile. The page uses the club brand, one heading, the shared artist picker, a count toward three artists, and a Continue button. It does not show the member navigation. Sign out remains available.

Members choose at least **three distinct artists** using the same live autocomplete and custom-name entry available in Profile. Names are compared after case/whitespace normalization, so duplicate spellings do not satisfy the minimum. Niche artists do not need to exist in either provider catalog. Existing autocomplete caching, keyboard support and provider-failure fallback apply here too.

Continue stays disabled below the minimum. Submission saves the artist choices and marks onboarding complete on the server before showing People. A failed save keeps the choices visible and shows an inline error. Refreshing or signing in on another device must not bypass an incomplete account's setup. Once complete, members can edit their music in Profile without repeating onboarding.

Existing accounts are grandfathered into the completed state when the requirement is introduced. They keep their profiles and current access even if they have fewer than three artists. Future accounts start incomplete and must finish setup. Account status is stored on the server; a browser-only flag is not sufficient enforcement.

The first-time flow asks only for music preferences. Creative roles, collaboration opt-in, biography and other profile details stay optional and available later. This keeps the first visit short while giving People matching enough information to begin.
