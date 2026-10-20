# Artist autocomplete

Manual artist entry searches the MusicBrainz artist catalog through an authenticated server endpoint. The browser shows local suggestions immediately, debounces remote requests, and keeps custom entry available when a name is missing or the provider is unavailable. Selected artists remain editable and use the same profile-save flow.

Only the typed artist query is sent to MusicBrainz. No member identifier, profile, message, or listening history is forwarded. Shared query results are cached in D1 for seven days. The app schedules upstream requests at least 1.1 seconds apart using a database reservation across Worker instances, sends a meaningful User-Agent, and uses bounded requests. Cached results avoid repeated upstream calls. Search requires no additional member account or API key.

Artist names remain the matching key in this baseline. Suggestions with the same normalized display name are collapsed; this does not establish that unrelated artists sharing a name are the same MusicBrainz entity. A future identity-aware matching model can retain MBIDs across all import sources.

MusicBrainz attribution appears beside search. References:
- https://musicbrainz.org/doc/MusicBrainz_API/Search
- https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
- https://musicbrainz.org/doc/About/Data_License
