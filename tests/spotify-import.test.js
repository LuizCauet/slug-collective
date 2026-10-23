import {test} from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {zipSync,strToU8,Zip,ZipDeflate} from '../web/vendor/fflate.js';
import {parseSpotifyFiles,SpotifyImportError} from '../web/spotify-import.js';

const row=(name='feeble little horse',extra={})=>({artistName:name,trackName:'A song',msPlayed:90000,endTime:'2025-01-01 10:00',...extra});
const file=(rows,name='StreamingHistory_music_0.json')=>new File([JSON.stringify(rows)],name);
const zip=entries=>new File([zipSync(Object.fromEntries(Object.entries(entries).map(([name,value])=>[name,strToU8(typeof value==='string'?value:JSON.stringify(value))])))],'my_spotify_data.zip');
const rejects=(promise,code)=>assert.rejects(promise,e=>e instanceof SpotifyImportError&&e.code===code);

test('standard, creatorName and extended histories aggregate case/spacing variants and preserve niche names',async()=>{
  const result=await parseSpotifyFiles([file([row('  feeble   little horse  '),row('FEEBLE LITTLE HORSE'),{creatorName:'天使の声',trackName:'Song',msPlayed:30000,endTime:'2025-02-02 11:30'}]),
    file([{master_metadata_album_artist_name:'janet',ms_played:45000,ts:'2025-03-01T00:00:00Z',spotify_track_uri:'spotify:track:abc123'}],'Streaming_History_Audio_2025_0.json')]);
  assert.deepEqual(result.artists,[{name:'feeble little horse',plays:2,msPlayed:180000},{name:'janet',plays:1,msPlayed:45000},{name:'天使の声',plays:1,msPlayed:30000}]);
  assert.deepEqual(result.summary,{listens:4,artistCount:3,firstPlayedAt:'2025-01-01T10:00:00.000Z',lastPlayedAt:'2025-03-01T00:00:00.000Z'});
});

test('excludes podcasts, audiobooks, private sessions, invalid records and plays under 30 seconds',async()=>{
  const result=await parseSpotifyFiles([file([row('Real'),row('Skip',{msPlayed:29999}),row('Zero',{msPlayed:0}),row('Negative',{msPlayed:-1}),row('String',{msPlayed:'90000'}),row('No time',{endTime:'nonsense'}),row('Private',{incognito_mode:true}),row('Podcast',{episodeName:'Episode'}),row('Audio book',{audiobook_title:'Book'}),row('Other',{mediaType:'podcast'}),{creatorName:'Unknown creator',msPlayed:90000,endTime:'2025-01-01 10:00'},
    {master_metadata_album_artist_name:'Episode',ms_played:90000,ts:'2025-01-01T10:00:00Z',spotify_track_uri:'spotify:episode:abc'}])]);
  assert.deepEqual(result.artists,[{name:'Real',plays:1,msPlayed:90000}]);
  assert.equal(result.summary.listens,1);
});

test('ZIP reads only supported music-history files and never returns account fields',async()=>{
  const progress=[];
  const result=await parseSpotifyFiles([zip({'Spotify Account Data/StreamingHistory_music_0.json':[row('Niche')],'Spotify Account Data/Userdata.json':{email:'private@example.test'},'StreamingHistory_podcast_0.json':[row('Podcast')]})],{onProgress:p=>progress.push(p)});
  assert.equal(result.artists[0].name,'Niche');
  assert.equal(result.summary.listens,1);
  assert.ok(!JSON.stringify(result).includes('private@example.test'));
  assert.ok(progress.some(p=>p.phase==='reading'));
});

test('extended-history ZIP and stored uncompressed ZIP work',async()=>{
  const source={'folder/Streaming_History_Audio_2020-2021_0.json':strToU8(JSON.stringify([{master_metadata_album_artist_name:'julie',ms_played:30000,ts:'2021-01-01T00:00:00Z'}]))};
  for(const level of [0,6]){
    const result=await parseSpotifyFiles([new File([zipSync(source,{level})],'history.zip')]);
    assert.equal(result.artists[0].name,'julie');
  }
});

test('streaming ZIP with data descriptors enforces actual expansion, not only declared sizes',async()=>{
  const parts=[];const archive=new Zip((error,chunk)=>{if(error)throw error;parts.push(chunk);});
  const entry=new ZipDeflate('StreamingHistory_music_0.json');archive.add(entry);entry.push(strToU8(JSON.stringify([row('Artist')])) ,true);archive.end();
  await rejects(parseSpotifyFiles([new File(parts,'history.zip')],{limits:{jsonBytes:30}}),'FILE_TOO_LARGE');
});

test('top 200 retains ranking while summary includes all eligible artists and listens',async()=>{
  const rows=Array.from({length:220},(_,i)=>row(`artist ${i}`));rows.push(row('artist 219'));
  const result=await parseSpotifyFiles([file(rows)]);
  assert.equal(result.artists.length,200);assert.equal(result.artists[0].name,'artist 219');
  assert.equal(result.summary.artistCount,220);assert.equal(result.summary.listens,221);
});

test('input, per-file, expanded, entry, file count and record limits fail usefully',async()=>{
  await rejects(parseSpotifyFiles([file([row()])],{limits:{inputBytes:1}}),'INPUT_TOO_LARGE');
  await rejects(parseSpotifyFiles([file([row()])],{limits:{jsonBytes:1}}),'FILE_TOO_LARGE');
  await rejects(parseSpotifyFiles([file([row()])],{limits:{expandedBytes:1}}),'EXPANSION_LIMIT');
  await rejects(parseSpotifyFiles([zip({'Userdata.json':'{}','StreamingHistory0.json':[]})],{limits:{entries:1}}),'ENTRY_LIMIT');
  await rejects(parseSpotifyFiles([file([row()]),file([row()])],{limits:{historyFiles:1}}),'TOO_MANY_FILES');
  await rejects(parseSpotifyFiles([file([row(),row()])],{limits:{records:1}}),'RECORD_LIMIT');
});

test('empty, malformed, unrelated, corrupt, unsupported and music-free exports have safe errors',async()=>{
  await rejects(parseSpotifyFiles([]),'NO_FILES');
  await rejects(parseSpotifyFiles([new File(['broken'],'history.json')]),'INVALID_JSON');
  await rejects(parseSpotifyFiles([file({email:'private@example.test'})]),'INVALID_HISTORY');
  await rejects(parseSpotifyFiles([zip({'Userdata.json':{email:'private@example.test'}})]),'NO_HISTORY');
  await rejects(parseSpotifyFiles([new File(['broken'],'history.zip')]),'INVALID_ZIP');
  await rejects(parseSpotifyFiles([new File(['x'],'history.csv')]),'UNSUPPORTED_FILE');
  await rejects(parseSpotifyFiles([file([row('Skip',{msPlayed:1})])]),'NO_MUSIC');
});

test('worker emits progress and aggregate results without network access or raw records',async()=>{
  const oldSelf=globalThis.self,oldFetch=globalThis.fetch;const messages=[];
  globalThis.self={postMessage:value=>messages.push(value)};
  globalThis.fetch=()=>{throw new Error('Import must not use the network');};
  try{
    await import('../web/spotify-worker.js');
    await self.onmessage({data:{files:[file([row('Niche',{ip_addr:'private-address',username:'private-user'})])]}});
    assert.ok(messages.some(message=>message.type==='progress'));
    const result=messages.find(message=>message.type==='result');
    assert.equal(result.result.artists[0].name,'Niche');
    assert.ok(!JSON.stringify(messages).includes('private-address'));
    assert.ok(!JSON.stringify(messages).includes('private-user'));
    messages.length=0;
    await self.onmessage({data:{files:[new File(['private invalid data'],'history.json')]}});
    assert.equal(messages.at(-1).type,'error');assert.equal(messages.at(-1).code,'INVALID_JSON');
    assert.ok(!JSON.stringify(messages).includes('private invalid data'));
  }finally{globalThis.self=oldSelf;globalThis.fetch=oldFetch;}
});

test('truncated ZIP never imports a partial profile',async()=>{
  const archive=zip({'StreamingHistory0.json':[row()]});
  const truncated=new File([await archive.slice(0,archive.size-22).arrayBuffer()],'truncated.zip');
  await rejects(parseSpotifyFiles([truncated]),'INVALID_ZIP');
});

test('37 history files exceeding the old 128 MiB expanded cap import completely with bounded per-file buffers',async()=>{
  const parts=[];
  const archive=new Zip((error,chunk)=>{if(error)throw error;parts.push(chunk);});
  const padding=' '.repeat(4*1024*1024);
  let expanded=0;
  // Generate and compress one JSON at a time. Retain only the small compressed
  // ZIP chunks, never 37 expanded JSON strings or parsed record arrays.
  for(let index=0;index<37;index++){
    const entry=new ZipDeflate(`Spotify Extended Streaming History/Streaming_History_Audio_2025_${index}.json`);
    archive.add(entry);
    const bytes=strToU8(JSON.stringify([row(`Niche artist ${index}`,{padding})]));
    expanded+=bytes.byteLength;entry.push(bytes,true);
  }
  archive.end();
  assert.ok(expanded>128*1024*1024);
  const archiveFile=new File(parts,'spotify-history-37-files.zip');
  assert.ok(archiveFile.size<1024*1024,'fixture retains a small compressed archive, not all expanded files');
  const completed=[];
  const result=await parseSpotifyFiles([archiveFile],{onProgress:progress=>{if(progress.phase==='reading')completed.push(progress.files);}});
  assert.equal(completed.length,37);assert.equal(completed.at(-1),37);
  assert.equal(result.summary.listens,37);assert.equal(result.summary.artistCount,37);
  assert.equal(result.artists.length,37);
  assert.equal(result.artists.reduce((sum,artist)=>sum+artist.plays,0),37);
});

test('limit errors report the measured size and configured limit instead of silently importing part of an archive',async()=>{
  const archive=zip({'StreamingHistory0.json':[row('First')],'StreamingHistory1.json':[row('Second')]});
  await assert.rejects(parseSpotifyFiles([archive],{limits:{expandedBytes:150}}),error=>error.code==='EXPANSION_LIMIT'&&error.message.includes('150 bytes')&&error.message.includes('Nothing was imported'));
  await assert.rejects(parseSpotifyFiles([file([row()])],{limits:{inputBytes:1}}),error=>error.code==='INPUT_TOO_LARGE'&&error.message.includes('1 byte')&&error.message.includes('Selected files total'));
});

test('distinct-artist limit rejects a new artist before insertion while repeated artists remain valid',async()=>{
  const repeated=await parseSpotifyFiles([file([row('First'),row('Second'),row('  FIRST  '),row('Second')])],{limits:{artists:2}});
  assert.equal(repeated.summary.artistCount,2);assert.equal(repeated.summary.listens,4);
  assert.deepEqual(repeated.artists.map(artist=>artist.plays),[2,2]);
  await assert.rejects(parseSpotifyFiles([file([row('First'),row('Second'),row('FIRST'),row('Third')])],{limits:{artists:2}}),error=>error.code==='ARTIST_LIMIT'&&error.message.includes('2 distinct-artist limit')&&error.message.includes('Nothing was imported'));
});
