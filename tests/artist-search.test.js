import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchArtists,ArtistSearchError} from '../server/artist-search.js';
const id=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const artist=(name,i=1,score=100,extra={})=>({id:id(i),name,score,...extra});
const response=artists=>new Response(JSON.stringify({artists}));
const reject=(promise,code,status)=>assert.rejects(promise,e=>e instanceof ArtistSearchError&&e.code===code&&(!status||e.status===status));

test('autocomplete uses fixed host, safe options, explicit fields and final-token prefix',async()=>{
  const result=await searchArtists('  feeble   little hor  ',{userAgent:'SlugCollective/test (https://example.test)',fetcher:async(url,options)=>{
    const parsed=new URL(url);assert.equal(parsed.origin,'https://musicbrainz.org');assert.equal(parsed.pathname,'/ws/2/artist/');
    assert.equal(parsed.searchParams.get('fmt'),'json');assert.equal(parsed.searchParams.get('limit'),'12');
    assert.equal(parsed.searchParams.get('query'),'(artist:(feeble AND little AND hor*) OR alias:(feeble AND little AND hor*))');
    assert.equal(options.redirect,'error');assert.equal(options.headers['User-Agent'],'SlugCollective/test (https://example.test)');
    assert.ok(options.signal instanceof AbortSignal);return response([artist('feeble little horse')]);
  }});
  assert.deepEqual(result,[{id:id(1),name:'feeble little horse',description:''}]);
});

test('Lucene operators, wildcard input and field injection are treated as literal tokens',async()=>{
  let query;
  await searchArtists('OR x:y (z)* \\ /ab/',{fetcher:async url=>{query=new URL(url).searchParams.get('query');return response([]);}});
  assert.equal(query,'(artist:(\\OR AND x\\:y AND \\(z\\)\\* AND \\\\ AND \\/ab\\/*) OR alias:(\\OR AND x\\:y AND \\(z\\)\\* AND \\\\ AND \\/ab\\/*))');
});

test('Unicode query stays intact after normalization and URL encoding',async()=>{
  await searchArtists('  天使の声  é  ',{fetcher:async url=>{assert.equal(new URL(url).searchParams.get('query'),'(artist:(天使の声 AND é*) OR alias:(天使の声 AND é*))');return response([]);}});
});

test('invalid query lengths and controls fail before contacting provider',async()=>{
  let calls=0;const fetcher=()=>{calls++;};
  for(const query of [null,'','x',' '.repeat(10),'x'.repeat(81),'ab\ncd'])await reject(searchArtists(query,{fetcher}),'INVALID_QUERY',400);
  assert.equal(calls,0);
});

test('results are score ordered, name/id deduplicated, sanitized and capped at ten',async()=>{
  const rows=[artist('  Niche\nartist  ',1,20,{disambiguation:'Artist\nfrom\tSanta Cruz',type:'Person',country:'US'}),artist('NICHE ARTIST',2,99),artist('Another name for same ID',2,80),artist('Invalid ID',3,90,{id:'bad'}),artist('x'.repeat(121),4,90),...Array.from({length:12},(_,i)=>artist(`Artist ${i}`,i+5,50+i,{disambiguation:'a'.repeat(200)}))];
  const result=await searchArtists('niche',{fetcher:async()=>response(rows)});
  assert.equal(result.length,10);assert.equal(result[0].id,id(2));assert.equal(result[0].name,'NICHE ARTIST');
  assert.equal(result[1].name,'Artist 11');assert.ok(result.every(r=>r.name.length<=120&&r.description.length<=160));
  assert.ok(!result.some(r=>r.name==='Invalid ID'));
  const single=await searchArtists('niche',{fetcher:async()=>response([rows[0]])});
  assert.equal(single[0].name,'Niche artist');assert.equal(single[0].description,'Artist from Santa Cruz · Person · US');
});

test('429 and 503 include retry hints; no automatic retries occur',async()=>{
  for(const status of [429,503]){
    let calls=0;
    await assert.rejects(searchArtists('niche',{fetcher:async()=>{calls++;return new Response(null,{status,headers:{'Retry-After':'17'}});}}),e=>e.code==='PROVIDER_UNAVAILABLE'&&e.status===status&&e.retryAfter===17);
    assert.equal(calls,1);
  }
  await reject(searchArtists('niche',{fetcher:async()=>new Response(null,{status:500})}),'PROVIDER_ERROR',502);
});

test('oversized advertised or streamed response bodies are rejected',async()=>{
  await reject(searchArtists('niche',{fetcher:async()=>new Response('{}',{headers:{'Content-Length':'262145'}})}),'BAD_RESPONSE');
  await reject(searchArtists('niche',{fetcher:async()=>new Response('x'.repeat(262145))}),'BAD_RESPONSE');
});

test('bad UTF-8, JSON and schema return safe provider errors',async()=>{
  for(const body of [new Uint8Array([0xff,0xff]),'private invalid data','{}']){
    await assert.rejects(searchArtists('niche',{fetcher:async()=>new Response(body)}),e=>e.code==='BAD_RESPONSE'&&!e.message.includes('private invalid data'));
  }
  await assert.rejects(searchArtists('niche',{fetcher:async()=>{throw new Error('private exception detail');}}),e=>e.code==='NETWORK_ERROR'&&!e.message.includes('private exception detail'));
});

test('timeout bounds fetch and stalled body reads and aborts provider request',async()=>{
  let signal;
  await reject(searchArtists('niche',{timeoutMs:10,fetcher:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}}),'TIMEOUT',504);
  assert.equal(signal.aborted,true);
  let cancelled=false;
  await reject(searchArtists('niche',{timeoutMs:10,fetcher:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}))}),'TIMEOUT',504);
  assert.equal(cancelled,true);
});
