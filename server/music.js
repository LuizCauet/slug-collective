const API = 'https://api.listenbrainz.org/1';
const DEFAULT_AGENT = 'SlugCollective/1.0 (club music discovery)';

export class MusicError extends Error {
  constructor(code, message, status = 502, retryAfter = null) {
    super(message);
    this.name = 'MusicError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// Reservations happen synchronously, so concurrent requests share the same budget.
// Bound queue time: reject excess traffic instead of accumulating unbounded waits.
export function createMusicLimiter({now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), maxWaitMs = 5000} = {}) {
  let next = 0;
  return async function limit() {
    const time = now();
    const wait = Math.max(0, next - time);
    if (wait > maxWaitMs) throw new MusicError('RATE_LIMITED', 'Music syncing is busy. Please try again shortly.', 429, Math.ceil(wait / 1000));
    next = Math.max(time, next) + 1000;
    if (wait) await sleep(wait);
  };
}

const isolateLimiter = createMusicLimiter();
function validUsername(username) {
  if (typeof username !== 'string' || !username.trim() || username.length > 256 || /[\u0000-\u001f\u007f]/.test(username)) {
    throw new MusicError('INVALID_USERNAME', 'A valid ListenBrainz username is required.', 400);
  }
  return username.trim();
}

function retrySeconds(value) {
  if (!value) return 60;
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) return Math.ceil(number);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : 60;
}

async function request(path, {fetcher = fetch, userAgent = DEFAULT_AGENT, limiter = isolateLimiter, timeoutMs = 10000} = {}, token) {
  await limiter();
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const headers = {'Accept': 'application/json', 'User-Agent': userAgent || DEFAULT_AGENT};
        if (token) headers.Authorization = `Token ${token}`;
        const response = await fetcher(`${API}${path}`, {headers, signal: controller.signal, redirect: 'manual'});
        if (response.status === 204) return null;
        if (response.status === 429) throw new MusicError('RATE_LIMITED', 'ListenBrainz is busy. Please try syncing again later.', 429, retrySeconds(response.headers.get('Retry-After')));
        if (response.status === 401 || response.status === 403) throw new MusicError('INVALID_TOKEN', 'That ListenBrainz token could not be verified.', 400);
        if (response.status === 404) throw new MusicError('NOT_FOUND', 'That ListenBrainz profile could not be found.', 404);
        if (!response.ok) throw new MusicError('PROVIDER_ERROR', 'ListenBrainz could not complete the sync. Please try again later.');
        try { return await response.json(); }
        catch { throw new MusicError('INVALID_RESPONSE', 'ListenBrainz returned an unreadable response. Please try again later.'); }
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new MusicError('TIMEOUT', 'ListenBrainz took too long to respond. Please try again.'));
        }, timeoutMs);
      })
    ]);
  } catch (error) {
    if (error instanceof MusicError) throw error;
    // Never propagate upstream exception text: it may contain request credentials.
    throw new MusicError('NETWORK_ERROR', 'Could not reach ListenBrainz. Please try again later.');
  } finally { clearTimeout(timer); }
}

function normalizeArtists(data) {
  if (data === null) return [];
  if (!Array.isArray(data?.payload?.artists)) throw new MusicError('INVALID_RESPONSE', 'ListenBrainz returned unexpected artist data. Please try again later.');
  const artists = [];
  const names = new Map();
  const mbids = new Map();
  for (const item of data.payload.artists.slice(0, 200)) {
    if (typeof item?.artist_name !== 'string' || typeof item.listen_count !== 'number' || !Number.isSafeInteger(item.listen_count) || item.listen_count < 0) continue;
    const name = item.artist_name.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!name || name.length > 300) continue;
    const mbid = typeof item.artist_mbid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.artist_mbid) ? item.artist_mbid.toLowerCase() : null;
    const key = name.toLowerCase();
    const sameName = names.get(key) || [];
    // Distinct MusicBrainz entities can share a name. A known identity must not
    // be overwritten merely because another artist has the same display name.
    const byName = mbid ? sameName.find(a => !a.mbid || a.mbid === mbid)
      : sameName.find(a => !a.mbid) || (sameName.length === 1 ? sameName[0] : null);
    const existing = (mbid && mbids.get(mbid)) || byName;
    if (existing) {
      existing.plays = Math.max(existing.plays, item.listen_count);
      if (!existing.mbid && mbid) existing.mbid = mbid;
      if (!sameName.includes(existing)) names.set(key, [...sameName, existing]);
      if (mbid) mbids.set(mbid, existing);
    } else {
      const artist = {name, mbid, plays: item.listen_count};
      artists.push(artist);
      names.set(key, [...sameName, artist]);
      if (mbid) mbids.set(mbid, artist);
    }
  }
  return artists.sort((a, b) => b.plays - a.plays);
}

export async function syncListenBrainz({username, ...options}) {
  username = validUsername(username);
  const data = await request(`/stats/user/${encodeURIComponent(username)}/artists?range=all_time&count=200`, options);
  return {username, artists: normalizeArtists(data), lastSyncedAt: Date.now()};
}

export async function connectListenBrainz({token, ...options}) {
  if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token.trim())) {
    throw new MusicError('INVALID_TOKEN', 'Enter your ListenBrainz user token from its settings page.', 400);
  }
  const proof = await request('/validate-token', options, token.trim());
  if (proof?.valid !== true) throw new MusicError('INVALID_TOKEN', 'That ListenBrainz token could not be verified.', 400);
  let username;
  try { username = validUsername(proof.user_name); }
  catch { throw new MusicError('INVALID_RESPONSE', 'ListenBrainz did not return a valid account. Please try again.'); }
  // Only the proof request receives the token. It is never included in output.
  return syncListenBrainz({username, ...options});
}
