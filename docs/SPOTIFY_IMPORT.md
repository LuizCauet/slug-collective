# Spotify export import

Profile contains an optional Connect services section. Import a Spotify ZIP directly, or select the extracted streaming-history JSON files together. Standard Account Data history and Extended Streaming History are supported. Members can continue using manual artists and ListenBrainz independently.

The browser reads and aggregates the history inside a dedicated worker. It previews up to 200 artists; members can remove artists before saving. Only the approved names and play/time totals are sent to the authenticated API. Raw archives, track-by-track history, account files, IP addresses, device details, and history date bounds are not stored by the app. Spotify imports can be replaced or removed without deleting manual artists or ListenBrainz imports.

Spotify exports are snapshots and do not sync automatically. Requesting an export is handled by Spotify and may take time. The interface links to Spotify Account Privacy and keeps those instructions collapsed.

Archive size and expansion limits protect browser memory. Unsupported files and archives without qualifying music history give actionable errors. The import excludes short plays, podcasts identified by Spotify fields, and explicitly private-session records. Community matching continues to use shared artist names, with greater weight for artists shared by fewer members; imported play counts are not presented as global popularity.

Reference: https://support.spotify.com/us/article/understanding-your-data/

## Import limits and memory

The importer accepts up to **250 MiB of selected input** and **1 GiB of expanded history data** per import. For a ZIP, input means the compressed archive size. For extracted JSON, input means the combined file sizes. MiB and GiB use powers of 1024.

The import also enforces these limits:

| Limit | Maximum |
| --- | ---: |
| One history JSON file, including an expanded ZIP entry | 32 MiB |
| Selected files | 128 |
| History files read across the selection | 128 |
| ZIP entries encountered across the selection | 1,000 |
| Listening records examined | 2,000,000 |
| Distinct normalized artists aggregated | 100,000 |
| Artists included in the final preview | 200 |

Selected files are processed sequentially. ZIP input is read in 4 KiB slices. The importer collects and parses one qualifying history entry at a time; it does not expand the entire archive into memory. Unrelated ZIP entries are skipped without starting their decompressor. Actual emitted bytes count toward the expansion limit, so forged ZIP size metadata cannot bypass the per-file or cumulative checks. Incomplete ZIP files are rejected instead of producing a partial profile.

These are input and parsing limits, not a guarantee of fixed memory use. A current entry can occupy decompressed chunks, an assembled byte buffer, decoded text, and parsed JavaScript objects during processing. The artist aggregate map also grows across files until the final top-200 selection. The worker keeps parsing off the main page thread, but available browser memory still determines which large exports a device can process. A separate 100,000 distinct-artist limit bounds growth of the aggregate map. Repeated listens to an existing artist continue to aggregate; adding another distinct artist at that limit stops the import with an actionable error.

A limit failure reports the measured size and the applicable limit. The failed import does not return a partial result for saving. Existing saved imports are not replaced until the member approves a successful preview and saves it.

## Large-selection regression

A synthetic 37-history-file ZIP expands beyond the former 128 MiB cumulative limit. The regression checks that all 37 files finish and that all 37 eligible listens and artists reach the result. Its files contain padding to exercise the byte threshold; it does not establish performance for two million records or a maximum-size artist map.

The test fixture for the local browser check is 167,767 bytes compressed and 155,199,783 bytes expanded. All 13 parser tests and all 85 application tests pass. The browser also completed this fixture and displayed all 37 artists. This is a regression result, not a performance benchmark. The user's actual 37-file export was not available, so its contents and behavior have not been verified.

This change remains in the local preview pending user approval. It does not authorize a push or live deployment.
