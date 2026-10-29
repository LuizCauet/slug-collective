# Explainable matching

The application uses a deterministic scoring baseline. It does not use a trained machine-learning model and does not estimate the probability of friendship or collaboration.

## People ordering

Normalize artist and genre names with Unicode NFKC normalization, leading/trailing whitespace removal, repeated-whitespace collapse and lowercasing. Count each normalized name once per member. A member's repeated spelling variants must not increase the score or the displayed overlap count.

For the candidate list passed to the ranker, let `N` be its size and `listeners(a)` be the number of candidates with artist `a`. Each distinct artist shared with the viewing member contributes:

```text
3 × (1 + ln((N + 1) / (listeners(a) + 1)))
```

Each distinct shared genre contributes **1**. The People score is the sum of the artist contributions and the shared-genre count. The artist contribution remains stronger per overlap: a common shared artist contributes 3, and a rarer shared artist contributes more. Several genre overlaps can still add up to more than one artist overlap. Imported play counts do not multiply these presence-based contributions.

Sort by total score descending. Equal scores use `String(member.id).localeCompare(String(other.id))` as the deterministic tie-break. Results are not sorted by raw overlap count alone; a member with a rarer shared artist may rank above someone with more common shared artists.

The **Shared taste** filter includes a member with at least one shared artist **or** one shared genre. People cards show the distinct shared-artist and shared-genre counts. When genres are the only overlap, the explanation names the shared genres and does not imply that the featured artist is shared. “Best matches first” describes this scoring order, not a measured recommendation-quality result.

## Genre identity

Suggestions and custom genres use the same normalization and weight. There is no alias dictionary or genre hierarchy. For example, `Shoegaze` and ` shoegaze ` match, while `Hip-hop` and `Hip hop`, or `R&B` and `R and B`, remain different names. Choosing a broad label does not automatically imply its subgenres.

## Create ordering

Create keeps the existing complementary-role mapping. Add **5 for each distinct complementary role** to the same artist-plus-genre score. This change does not alter which creative roles complement each other or the opt-in rules for appearing in Create.

Genres are optional. With no genres, artist and creative-role behavior remains unchanged. With no artist or genre overlap, People falls back to the stable member-ID order among equal scores. Empty profiles can still browse permitted members.

## Verification

The matching tests cover genre-only eligibility, combined-score ordering, rarity weighting, normalized duplicate counts, missing preferences, stable ties, and the existing Create bonus. UI state tests execute the real ranker with the application's filter and card rendering functions. They check artist-only, genre-only, combined, and zero-overlap cases, exact count text, escaped member data, and honest genre-only explanations.

The full automated suite passes 106 tests. The production build succeeds. Browser visual verification of this update is pending because the available browser automation could not reliably identify its current URL. These automated rendering checks do not establish browser layout or accessibility behavior. Publishing remains subject to the user's preview approval.
