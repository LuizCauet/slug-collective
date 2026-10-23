import {Unzip, UnzipInflate} from './vendor/fflate.js';

export class SpotifyImportError extends Error {
  constructor(code,message){super(message);this.name='SpotifyImportError';this.code=code;}
}
export const SPOTIFY_LIMITS=Object.freeze({inputBytes:250*1024*1024,jsonBytes:32*1024*1024,expandedBytes:1024*1024*1024,entries:1000,historyFiles:128,records:2_000_000,artists:100_000});
const fail=(code,message)=>{throw new SpotifyImportError(code,message);};
const byteLabel=bytes=>bytes>=1024*1024?`${Number((bytes/(1024*1024)).toFixed(2))} MiB`:`${bytes.toLocaleString('en')} byte${bytes===1?'':'s'}`;
const historyName=name=>/^(?:StreamingHistory(?:_music)?(?:_?\d+)?|Streaming_History_Audio[^/]*)\.json$/i.test(name.replaceAll('\\','/').split('/').at(-1));
const decoder=new TextDecoder('utf-8',{fatal:true});

function playedAt(value){
  if(typeof value!=='string')return null;
  let date=value.trim();
  if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(date))date=date.replace(' ','T')+'Z';
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(date))return null;
  const ms=Date.parse(date);
  return Number.isFinite(ms)&&ms>=Date.UTC(2006,0,1)&&ms<=Date.now()+86400000?ms:null;
}

function musicListen(row){
  if(!row||typeof row!=='object'||Array.isArray(row)||row.incognito_mode===true)return null;
  if(row.episode_name||row.episodeName||row.episode_show_name||row.spotify_episode_uri||row.audiobook_title||row.audiobook_uri)return null;
  const media=String(row.mediaType??row.media_type??row.type??'').toLowerCase();
  if(media&&media!=='music'&&media!=='track')return null;
  const extended='master_metadata_album_artist_name' in row || 'ms_played' in row;
  let name=extended?row.master_metadata_album_artist_name:row.artistName;
  // New account exports use creatorName for both artists and podcasts. Require
  // positive music context instead of turning arbitrary creators into artists.
  if(!name&&typeof row.creatorName==='string'&&(row.trackName||media==='music'||media==='track'))name=row.creatorName;
  if(extended&&row.spotify_track_uri!=null&&!/^spotify:track:[A-Za-z0-9]+$/.test(row.spotify_track_uri))return null;
  const ms=extended?row.ms_played:row.msPlayed;
  const timestamp=playedAt(extended?row.ts:row.endTime);
  if(typeof name!=='string'||typeof ms!=='number'||!Number.isSafeInteger(ms)||ms<30000||ms>86400000||timestamp===null)return null;
  name=name.normalize('NFKC').trim().replace(/\s+/g,' ');
  if(!name||name.length>120||/[\u0000-\u001f\u007f]/.test(name))return null;
  return {name,ms,timestamp};
}

/** Files never leave this module. Only aggregates and date bounds are returned. */
export async function parseSpotifyFiles(files,{onProgress=()=>{},limits={}}={}){
  const cap={...SPOTIFY_LIMITS,...limits};
  const selected=Array.from(files||[]);
  if(!selected.length)fail('NO_FILES','Choose your Spotify ZIP or streaming-history JSON files.');
  if(selected.length>cap.historyFiles)fail('TOO_MANY_FILES','Choose fewer files, or use the original Spotify ZIP.');
  let inputBytes=0;
  for(const file of selected){
    if(!file||!Number.isSafeInteger(file.size)||file.size<0||typeof file.arrayBuffer!=='function')fail('INVALID_FILE','Choose a Spotify ZIP or JSON file.');
    inputBytes+=file.size;
  }
  if(inputBytes>cap.inputBytes)fail('INPUT_TOO_LARGE',`Selected files total ${byteLabel(inputBytes)}; the input limit is ${byteLabel(cap.inputBytes)}. Select fewer history JSON files and retry. Nothing was imported.`);
  let expanded=0,entries=0,historyFiles=0,records=0,listens=0,first=null,last=null;
  const aggregated=new Map();
  const countBytes=size=>{expanded+=size;if(expanded>cap.expandedBytes)fail('EXPANSION_LIMIT',`History exceeds the ${byteLabel(cap.expandedBytes)} expanded limit (${byteLabel(expanded)} read). Select fewer history JSON files and retry. Nothing was imported.`);};
  const fileTooLarge=size=>fail('FILE_TOO_LARGE',`One history file is ${byteLabel(size)}; the per-file limit is ${byteLabel(cap.jsonBytes)}. Choose history files below that limit. Nothing was imported.`);
  function consume(bytes){
    if(++historyFiles>cap.historyFiles)fail('TOO_MANY_FILES','The archive contains too many history files. Select a smaller set of JSON files.');
    let rows;
    try{rows=JSON.parse(decoder.decode(bytes));}catch{fail('INVALID_JSON','A history file is unreadable. Select the original Spotify JSON files or download the export again.');}
    if(!Array.isArray(rows))fail('INVALID_HISTORY','Streaming history must be a JSON list of listening records.');
    records+=rows.length;
    if(records>cap.records)fail('RECORD_LIMIT','There are too many listening records in one import. Select fewer history files.');
    for(const row of rows){
      const listen=musicListen(row);if(!listen)continue;
      const key=listen.name.toLocaleLowerCase('en');
      if(!aggregated.has(key)&&aggregated.size>=cap.artists)fail('ARTIST_LIMIT',`History exceeds the ${cap.artists.toLocaleString('en')} distinct-artist limit. Select fewer history JSON files and retry. Nothing was imported.`);
      const artist=aggregated.get(key)||{name:listen.name,plays:0,msPlayed:0};
      artist.plays++;artist.msPlayed+=listen.ms;aggregated.set(key,artist);
      listens++;first=first===null?listen.timestamp:Math.min(first,listen.timestamp);last=last===null?listen.timestamp:Math.max(last,listen.timestamp);
    }
    onProgress({phase:'reading',files:historyFiles,listens});
  }
  async function archive(file){
    // fflate intentionally accepts raw local entries without a central directory.
    // Require a complete ZIP end record so corrupt/truncated downloads cannot
    // silently produce a partial listening profile.
    if(file.size<22)fail('INVALID_ZIP','The ZIP is incomplete. Download it again or select its extracted JSON files.');
    const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer());
    const view=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);let end=-1;
    for(let i=tail.length-22;i>=0;i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===tail.length){end=i;break;}
    if(end<0||view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)fail('INVALID_ZIP','Choose a complete, single-part Spotify ZIP or extract its JSON history files.');
    if(view.getUint16(end+10,true)>cap.entries)fail('ENTRY_LIMIT','This ZIP contains too many files. Select the streaming-history JSON files directly.');
    if(view.getUint32(end+12,true)+view.getUint32(end+16,true)>file.size-22)fail('INVALID_ZIP','The ZIP is incomplete. Download it again or select its extracted JSON files.');
    let failure=null,accepted=0,completed=0;
    const unzip=new Unzip(entry=>{
      if(++entries>cap.entries)fail('ENTRY_LIMIT','This ZIP contains too many files. Select the streaming-history JSON files directly.');
      if(!historyName(entry.name))return;
      if(entry.originalSize>cap.jsonBytes)fileTooLarge(entry.originalSize);
      if(historyFiles+accepted-completed>=cap.historyFiles)fail('TOO_MANY_FILES','The archive has too many history files.');
      accepted++;
      let size=0;const chunks=[];
      entry.ondata=(error,chunk,final)=>{
        if(failure)return;
        try{
          if(error)fail('INVALID_ZIP','The Spotify ZIP could not be read. Try extracting its history JSON files first.');
          size+=chunk.length;countBytes(chunk.length);
          if(size>cap.jsonBytes)fileTooLarge(size);
          chunks.push(chunk);
          if(final){const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}chunks.length=0;consume(bytes);completed++;}
        }catch(error){failure=error;chunks.length=0;entry.terminate();}
      };
      entry.start();
    });
    unzip.register(UnzipInflate);
    try{
      // Small input slices bound each synchronous inflate step before enforcing
      // the actual expanded-byte limits, even for forged ZIP size metadata.
      for(let offset=0;offset<file.size;offset+=4096){
        const bytes=new Uint8Array(await file.slice(offset,offset+4096).arrayBuffer());
        unzip.push(bytes,offset+4096>=file.size);
        if(failure)throw failure;
      }
    }catch(error){if(error instanceof SpotifyImportError)throw error;fail('INVALID_ZIP','The Spotify ZIP could not be read. Try extracting its history JSON files first.');}
    if(accepted!==completed)fail('INVALID_ZIP','The ZIP is incomplete. Download it again or select its extracted JSON files.');
  }
  for(const file of selected){
    const name=String(file.name||'').toLowerCase();
    onProgress({phase:'opening',files:historyFiles,listens});
    if(name.endsWith('.zip'))await archive(file);
    else if(name.endsWith('.json')){
      if(file.size>cap.jsonBytes)fileTooLarge(file.size);
      countBytes(file.size);consume(new Uint8Array(await file.arrayBuffer()));
    }else fail('UNSUPPORTED_FILE','Choose a Spotify ZIP or streaming-history JSON file.');
  }
  if(!historyFiles)fail('NO_HISTORY','No music streaming-history files were found. Choose StreamingHistory_music or Streaming_History_Audio JSON files.');
  if(!listens)fail('NO_MUSIC','No eligible music listens were found. Choose music history; podcast, private-session, and plays under 30 seconds are excluded.');
  return {artists:[...aggregated.values()].sort((a,b)=>b.plays-a.plays||b.msPlayed-a.msPlayed||a.name.localeCompare(b.name)).slice(0,200),
    summary:{listens,artistCount:aggregated.size,firstPlayedAt:new Date(first).toISOString(),lastPlayedAt:new Date(last).toISOString()}};
}
