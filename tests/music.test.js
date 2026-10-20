import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectListenBrainz, syncListenBrainz, MusicError, createMusicLimiter} from '../server/music.js';

const token = '00000000-0000-4000-8000-000000000001';
const mbid = '93e6118e-7fa8-49f6-9e02-699a1ebce105';
const limiter = async () => {};
const json = value => new Response(JSON.stringify(value));
const artists = entries => json({payload:{artists:entries}});

test('connection verifies ownership, imports statistics and never returns or forwards token to stats', async () => {
  const calls = [];
  const result = await connectListenBrainz({token, limiter, userAgent:'SlugCollective/test', fetcher:async (url, options) => {
    calls.push({url, options});
    return calls.length === 1 ? json({valid:true,user_name:'music fan'}) : artists([{artist_name:'  Deep   Cut  ',artist_mbid:mbid,listen_count:12}]);
  }});
  assert.equal(calls[0].url,'https://api.listenbrainz.org/1/validate-token');
  assert.equal(calls[0].options.headers.Authorization,`Token ${token}`);
  assert.equal(calls[1].url,'https://api.listenbrainz.org/1/stats/user/music%20fan/artists?range=all_time&count=200');
  assert.equal(calls[1].options.headers.Authorization,undefined);
  assert.equal(calls[1].options.headers['User-Agent'],'SlugCollective/test');
  assert.deepEqual(result.artists,[{name:'Deep Cut',mbid,plays:12}]);
  assert.equal(result.username,'music fan');
  assert.ok(Number.isSafeInteger(result.lastSyncedAt));
  assert.ok(!JSON.stringify(result).includes(token));
});

test('invalid token fails before statistics import', async () => {
  let count=0;
  await assert.rejects(connectListenBrainz({token,limiter,fetcher:async()=>{count++;return json({valid:false});}}),e=>e instanceof MusicError && e.code==='INVALID_TOKEN');
  assert.equal(count,1);
  await assert.rejects(connectListenBrainz({token:'bad\r\nheader',limiter}),e=>e.code==='INVALID_TOKEN');
});

test('no calculated statistics means empty imports, never fictional artists', async () => {
  const result=await syncListenBrainz({username:'new-member',limiter,fetcher:async()=>new Response(null,{status:204})});
  assert.deepEqual(result.artists,[]);
});

test('deduplicates normalized names and MBIDs, drops malformed entries and caps input', async () => {
  const entries=[{artist_name:'Artist',artist_mbid:mbid,listen_count:12},{artist_name:' ARTIST ',listen_count:15},{artist_name:'Other credit',artist_mbid:mbid,listen_count:9},
    {artist_name:'Bad',listen_count:-1},{artist_name:'Infinite',listen_count:Infinity},{artist_name:'String',listen_count:'4'}, {artist_name:'No ID',artist_mbid:'broken',listen_count:0}];
  const result=await syncListenBrainz({username:'member',limiter,fetcher:async()=>artists(entries)});
  assert.deepEqual(result.artists,[{name:'Artist',mbid,plays:15},{name:'No ID',mbid:null,plays:0}]);
  const capped=await syncListenBrainz({username:'member',limiter,fetcher:async()=>artists(Array.from({length:300},(_,i)=>({artist_name:`Artist ${i}`,listen_count:i})))});
  assert.equal(capped.artists.length,200);
});

test('provider failure statuses are actionable typed errors with no automatic retries', async () => {
  for (const [status,code] of [[429,'RATE_LIMITED'],[404,'NOT_FOUND'],[500,'PROVIDER_ERROR'],[401,'INVALID_TOKEN']]) {
    let calls=0;
    await assert.rejects(syncListenBrainz({username:'member',limiter,fetcher:async()=>{calls++;return new Response(null,{status,headers:{'Retry-After':'17'}});}}),e=>e.code===code && (status!==429 || e.retryAfter===17));
    assert.equal(calls,1);
  }
});

test('different MusicBrainz artists with the same name retain their separate identities', async () => {
  const otherMbid='ae9ed5e2-4caf-4b3d-9cb3-2ad626b91714';
  const result=await syncListenBrainz({username:'member',limiter,fetcher:async()=>artists([
    {artist_name:'Same Name',artist_mbid:mbid,listen_count:20},
    {artist_name:'Same Name',artist_mbid:otherMbid,listen_count:10},
    {artist_name:'Alternate credit',artist_mbid:otherMbid,listen_count:12}
  ])});
  assert.deepEqual(result.artists,[{name:'Same Name',mbid,plays:20},{name:'Same Name',mbid:otherMbid,plays:12}]);
});

test('malformed JSON, wrong schema and secret-bearing network errors do not escape', async () => {
  await assert.rejects(syncListenBrainz({username:'member',limiter,fetcher:async()=>new Response('not JSON')}),e=>e.code==='INVALID_RESPONSE');
  await assert.rejects(syncListenBrainz({username:'member',limiter,fetcher:async()=>json({payload:{}})}),e=>e.code==='INVALID_RESPONSE');
  await assert.rejects(connectListenBrainz({token,limiter,fetcher:async()=>{throw new Error(token);}}),e=>e.code==='NETWORK_ERROR' && !e.message.includes(token));
});

test('requests have bounded timeout even when fetch ignores AbortSignal', async () => {
  await assert.rejects(syncListenBrainz({username:'member',limiter,timeoutMs:10,fetcher:()=>new Promise(()=>{})}),e=>e.code==='TIMEOUT');
});

test('isolate limiter reserves one-second slots for concurrency and rejects overload', async () => {
  const sleeps=[];
  const limit=createMusicLimiter({now:()=>10000,sleep:async ms=>sleeps.push(ms),maxWaitMs:2000});
  await Promise.all([limit(),limit(),limit()]);
  assert.deepEqual(sleeps,[1000,2000]);
  await assert.rejects(limit(),e=>e.code==='RATE_LIMITED' && e.retryAfter===3);
});
