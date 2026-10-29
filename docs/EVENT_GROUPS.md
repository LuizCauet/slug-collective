# Event groups

Admins open **Events**, create a session, and share its QR code or link. Members sign in with their existing account, review saved artists, and explicitly join. An event link does not replace the club invite required for new accounts.

Set the preferred group size before sorting; it can be any whole number of at least two. Sorting distributes remainders to avoid singletons. Artists drive matching, with rarer shared artists weighted more strongly. Genres break artist-score ties. Hosts see private overlap warnings, review a draft, move members, and publish it. Only the published version is visible to attendees.

Attendees see their own group first and can choose **View all groups**. Late arrivals wait for manual placement. Published groups are never automatically reshuffled. Saving another size clears the draft, while published groups remain visible until the host saves and publishes manual changes. Ended sessions remain read-only.

There is no fixed 50-person attendance cap. Initial local benchmarks cover 50, 100, and 200 attendees; these are validation samples, not a guarantee of unlimited capacity. Sorting uses a bounded heuristic rather than an exact global optimizer. Existing blocks prevent sharing a group; infeasible placements remain waiting without revealing private block relationships.

The additive migration `0006_event_groups.sql` adds events, attendance, scoring snapshots, roster-change triggers, and an OAuth return path. Draft/publication versions prevent stale writes. Deleted accounts cascade out of attendance and taste snapshots. QR generation is local, using the MIT-licensed generator in `web/vendor/`.

Validation includes matching fixtures, attendance totals beyond 50, access control, CSRF, duplicate joins, stale drafts, late placement, account deletion, and authentication return paths. Browser verification covers host creation, QR decoding to the exact URL, mobile joining, changing size, publication, own-group-first results, all-group navigation, and horizontal overflow.
