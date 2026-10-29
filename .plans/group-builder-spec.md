# Event group builder specification

Status: ready for implementation planning. Interview completed 2026-10-28.
Branch: plan/group-builder. This checkout is separate from the shared taste page work.

## Purpose

Let club admins gather members through a QR code and form music production groups of an admin-configured size based on saved music taste. Members meet in person and produce music on laptops. Hosts handle equipment and production experience outside the tool.

## Confirmed product decisions

- Only club admins can create and manage events.
- There is no fixed 50-attendee product cap. Use 50 attendees as an initial performance validation target; measure larger rosters before claiming supported scale. Any necessary operational ceiling must be configurable and explained, rather than silently hard-coded to 50.
- Members scan a QR code or open its equivalent link. A Slug Collective account is required; use saved taste rather than guest entry.
- Show the event and the member's saved artists before an explicit Join action.
- Any signed-in member with the link can join while joining is open. No attendance approval.
- Admins can set and change the preferred group size (a whole number of at least two), including sizes larger than three. Default to two for laptop production. Adjust actual group sizes to include everyone without singletons when feasible.
- Prioritize strong taste matches even if some groups have weaker overlap. Do not optimize for equal match quality across groups.
- Shared artists are the primary signal; genres provide a fallback.
- Host reviews a private draft, sees weak-match warnings, moves individuals, and can Sort Again before the first publication.
- No group locks in the first version.
- Published groups stay stable. Later changes require manual host placement or moves and explicit publication.
- Late arrivals wait for host placement. Do not automatically reshuffle published groups.
- After publication, attendees first see only their own group, with group number, names, photos, and shared artists. A View all groups action opens the other groups, with a clear return to My group. No new group chat.
- Keep ended events available as read-only past events for their attendees and admins.

## Proposed implementation defaults

The following resolve details not explicitly selected during the interview. They are implementation defaults, not additional user requirements.

- Event fields: title, optional meeting instructions/location, preferred group size. Creation opens a lobby with a shareable URL and QR code. No scheduling system is needed.
- Before publication, attendees see their join status and attendee count. Full roster and drafts are admin-only.
- Joining and event phase are separate: joining can be open or closed during a lobby or published event; ending always closes joining.
- Participants can leave. Before publication this invalidates the draft. After publication it updates attendance immediately and marks affected groups as needing host attention; no automatic regrouping. A lone remaining participant sees a clear placement-pending message.
- Use the current saved taste when generating a draft. Record its scoring input revision and explanations so later profile edits do not silently change groups or their published explanation.
- Members who have not completed required account onboarding complete the existing flow and return to the event. An event link does not bypass registration invites or account restrictions.
- Use current names and photos in past events; do not retain deleted profile information solely for event history. Remove deleted members' identifying data and taste explanations involving them.
- Honor existing member blocks as a hard constraint on sharing a group. Do not expose who blocked whom. If constraints prevent complete placement, show the host a generic placement warning rather than silently violating them.

## Attendee flow

1. Open /events/:eventId through QR or link.
2. If signed out, sign in and return to this event through a validated internal return path.
3. Show event title, instructions, attendee count, preferred size, and the member's saved artists. Join requires an explicit tap.
4. Confirm attendance idempotently. Show waiting state, Leave, and whether joining is closed. Do not display a fixed 50-person limit. If a configured operational ceiling exists, show a clear capacity message; no automatic capacity waitlist in v1.
5. On publication, show only the member's group by default. Provide an explicit View all groups action and a My group return action; do not automatically render the full group list below their group. Group cards show number, names, avatars, and honest overlap explanations.
6. A late arrival sees Waiting for host placement and can optionally open View all groups.
7. Show a clear update notice if a later published revision changes their group.
8. Ended events remain readable; join, leave, sorting, and editing controls are disabled.

## Host flow

1. Create event from an admin-only Events entry. Show QR and copy-link controls.
2. Monitor roster and count; close or reopen joining; remove an attendee who is absent.
3. Set the preferred group size and press Sort into groups. Admins can change this size before sorting again; changing it invalidates the existing draft. Zero or one attendee cannot produce a valid group.
4. Review numbered draft groups, overlap explanations, and warnings. Show attendees who could not be assigned.
5. Move members using accessible controls; drag and drop may supplement but must not be the only method. Allow temporary invalid draft sizes while moving; clearly flag them.
6. Sort Again replaces the unpublished draft. With identical inputs, stable deterministic output is acceptable; the action is not promised to produce random alternatives. Warn before replacing manual adjustments.
7. Publish only a validated draft. If attendance changed since sorting, require a fresh review rather than publishing a stale roster.
8. After publication, admins may change the preferred size and stage manual changes against the current published version. A size change does not automatically move members or reshuffle; apply it through reviewed manual changes and explicit publication. Other attendees keep seeing that version until Publish changes succeeds.
9. End event explicitly; preserve the last published results and any unassigned attendance state read-only.

## Matching design

Implement a pure server-side grouping module. Share artist normalization and scoring primitives where practical with the shared taste work, but keep event grouping independent of discovery-page rendering.

Normalize and deduplicate artist and genre labels using the agreed application normalization. Combine manual and imported artists using the existing effective-profile rules. Exclude creative roles, laptop ownership, production skill, albums, and listening counts from grouping.

For an event roster of N attendees, compute artist listener frequencies within that roster. Proposed pair artist score: sum over shared artists of 3 * (1 + ln((N + 1) / (artistListenerCount + 1))). Pair genre score is the number of shared normalized genres. Coordinate the precise primitives with the shared taste branch before implementation; that branch is concurrently changing matching behavior.

Optimize lexicographically:

1. Satisfy hard constraints: distinct active members, each assigned at most once, group sizes of at least two, adjusted around the configured preference, no blocked pair in a group.
2. Include all attendees whenever feasible. If constraints prevent this, maximize assigned count and surface the remainder for host action.
3. For preference two, use floor(N / 2) groups; for larger preferences, use ceil(N / preferred size), capped at floor(N / 2). Distribute attendees as evenly as possible, respecting hard constraints and avoiding singletons. For preference two and seven attendees, produce 3/2/2; for preference three and four attendees, produce 2/2. If the preference exceeds attendance, use one group when at least two attendees are present. Show the resulting size distribution before publication.
4. Maximize total within-group artist affinity, measured as the mean pair artist score per group summed across groups. Mean pair scores prevent larger groups from receiving an advantage merely because they contain more pair comparisons.
5. Break artist-score ties with the corresponding mean genre affinity, then stable member IDs.

This preserves strong matches without a fairness penalty. A practical implementation may use deterministic multi-start greedy construction followed by bounded swaps and group repartitioning. Do not claim a global optimum unless an exact solver is used and verified. Profile 50-member inputs and larger rosters, record runtime and memory, and keep request work bounded. Roster size and group size both affect matching cost; choose operational limits from measurements.

For each group, list artists shared by all members first. For partial overlaps, label the relevant members; never imply every group member shares an artist unless they do. If there are no shared artists, show shared genres. If there is no overlap, say so plainly. Do not show a fabricated percentage.

Host-only warnings: genre-only match; no shared taste; or a member with no artist connection to any group partner. Warnings inform review and do not block publication of an otherwise valid group. Never show private matching warnings to attendees.

## State, data, and API boundaries

Use existing Cloudflare Worker, D1, authentication, admin checks, origin checks, and CSRF protection. No new framework or external matching service is needed.

Suggested tables:

- events: ID, creator, title, instructions, preferred size, phase (lobby/published/ended), joining-open flag, roster revision, draft revision, published revision, timestamps.
- event_attendees: unique event/member pair, active/left/removed state, join timestamp. Make joining idempotent and handle simultaneous joins and rejoining atomically. If an operational ceiling is configured, enforce it atomically.
- event_group_revisions: event, revision, draft/published state, source roster revision, scoring version, creator, timestamps, bounded scoring snapshot/explanations.
- event_group_members: revision, group number, member ID; unique assignment per revision.

Use application-consistent foreign keys and deletion behavior. Store only data needed for event operation and explanations; do not copy raw music imports.

Suggested member routes: GET event, POST join, POST leave, GET published groups. Suggested admin routes: create/list events, update event/joining, remove attendee, generate draft, edit draft, publish, end. Exact paths should follow existing server conventions.

Enforce permissions server-side: only admins read drafts/rosters or mutate groups; only active attendees and admins read published/past groups. A signed-in non-attendee with the link can read the join preview, not the full attendee roster or groups. A removed attendee loses group access. Being an attendee does not grant admin controls.

Use optimistic revisions for every draft edit and publication. Return a conflict when another admin or a roster change made the operation stale. Publish a full revision atomically; clients must never observe partial moves. End is idempotent and prevents subsequent mutation. Poll only while the event view is open, with backoff on failure; use a published revision to detect updates.

## Integration and delivery

Implement in the separate branch/worktree. The branch started at df09a76 and now includes committed shared taste changes through 48c90e5. Do not overwrite, reset, or commit that agent's files. Integrate its final normalization/scoring changes deliberately before group-builder implementation is merged.

Suggested order: pure matching module and fixtures; schema/migration and authorized API; member join/wait/results flow; admin QR/lobby/draft/publish flow; past-event view; browser verification. Generate the QR locally from the event URL rather than sending event URLs to an external QR service.

## Acceptance and validation

- Account-required QR flow returns to the right event after authentication and requires explicit Join.
- Duplicate joins count once; concurrent joins remain consistent; closed/ended events reject new joins. Verify no fixed 50-person product cap exists and test any configured operational ceiling.
- Test attendee totals 2 through 50 and larger benchmark rosters across preferred sizes 2, 3, 4, 5, and sizes exceeding attendance. Verify complete coverage without singletons when unconstrained, balanced remainder sizes, and draft invalidation when admins change size. Zero/one attendees remain waiting.
- Artist normalization and import deduplication agree with shared taste. Niche artist matches outrank genre-only matches. No equipment/role signal enters scoring.
- Small exhaustive fixtures compare heuristic results against known good partitions; large fixtures validate bounded runtime, deterministic behavior, and complete valid assignment. Test blocked-pair infeasibility without revealing block details.
- Group explanations distinguish all-member overlap from partial overlap. Host warnings never appear in attendee API responses.
- Roster changes invalidate drafts; stale edits/publication conflict. Published groups remain visible and unchanged while a later draft is edited.
- Late arrivals remain unassigned until explicit host publication. Full automatic reshuffling is unavailable after first publication.
- Attendees first see their own published group and can explicitly open all groups and return; outsiders cannot read groups. Admin-only controls and endpoints reject non-admins.
- Ended events are read-only and accessible to the intended past attendees. Deleted accounts do not leave identifying snapshots behind.
- Verify mobile QR entry, sign-in return, waiting, results, host moves without drag and drop, empty/error states, and update notices. Run relevant existing checks once implementation exists.

## Outside v1

Guest participation, laptop/skill balancing, approval queues, capacity waitlists, group locks, automatic late placement, repeated activity rounds, group chat, automatic post-publication reshuffles, and learned recommendation models.
