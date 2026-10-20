const MAX_BYTES=256*1024;
const DEFAULT_AGENT='SlugCollective/1.0 (https://beta.slugcollective.workers.dev)';

export class ArtistSearchError extends Error{
  constructor(code,message,status=502,retryAfter=null){super(message);this.name='ArtistSearchError';this.code=code;this.status=status;this.retryAfter=retryAfter;}
}
const fail=(code,message,status=502,retryAfter=null)=>{throw new ArtistSearchError(code,message,status,retryAfter);};
const clean=value=>typeof value==='string'?value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim():'';
function queryString(value){
  // Artist/alias fields and trailing-token wildcard follow the official syntax:
  // https://musicbrainz.org/doc/Indexed_Search_Syntax
  if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))fail('INVALID_QUERY','Enter between 2 and 80 characters to search artists.',400);
  const query=clean(value);
  if(query.length<2||query.length>80)fail('INVALID_QUERY','Enter between 2 and 80 characters to search artists.',400);
  const tokens=query.split(' ').map(token=>{
    let escaped=token.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g,'\\$&');
    // Lucene treats uppercase Boolean words as operators even inside a field.
    if(/^(?:AND|OR|NOT)$/.test(escaped))escaped='\\'+escaped;
    return escaped;
  });
  tokens[tokens.length-1]+='*';
  const literal=tokens.join(' AND ');
  return `(artist:(${literal}) OR alias:(${literal}))`;
}
function retryAfter(value){
  const number=Number(value);
  if(value&&Number.isFinite(number)&&number>=0)return Math.ceil(number);
  const date=Date.parse(value||'');
  return Number.isFinite(date)?Math.max(1,Math.ceil((date-Date.now())/1000)):60;
}
async function boundedJson(response,signal){
  const declared=Number(response.headers.get('Content-Length'));
  if(declared>MAX_BYTES)fail('BAD_RESPONSE','Artist search returned too much data. Please try again.');
  if(!response.body)fail('BAD_RESPONSE','Artist search returned an empty response.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  const cancel=()=>{reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();fail('BAD_RESPONSE','Artist search returned too much data. Please try again.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
    catch{fail('BAD_RESPONSE','Artist search returned unreadable data. Please try again.');}
  }finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
}

/** Fixed-host provider only. The caller owns authentication, cache and rate limits. */
export async function searchArtists(query,{fetcher=fetch,userAgent=DEFAULT_AGENT,timeoutMs=8000}={}){
  const literal=queryString(query);
  const url=new URL('https://musicbrainz.org/ws/2/artist/');
  url.searchParams.set('fmt','json');url.searchParams.set('limit','12');url.searchParams.set('query',literal);
  const controller=new AbortController();let timer;
  try{
    return await Promise.race([
      (async()=>{
        const response=await fetcher(url.href,{headers:{Accept:'application/json','User-Agent':userAgent||DEFAULT_AGENT},signal:controller.signal,redirect:'error'});
        if(response.status===429||response.status===503)fail('PROVIDER_UNAVAILABLE','Artist search is busy. You can still add the artist manually.',response.status,retryAfter(response.headers.get('Retry-After')));
        if(!response.ok)fail('PROVIDER_ERROR','Artist search is unavailable. You can still add the artist manually.');
        const data=await boundedJson(response,controller.signal);
        if(!Array.isArray(data?.artists))fail('BAD_RESPONSE','Artist search returned unexpected data. Please try again.');
        const rows=data.artists.slice(0,200).map(artist=>{
          const name=clean(artist?.name),id=typeof artist?.id==='string'?artist.id.toLowerCase():'';
          if(!name||name.length>120||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))return null;
          const score=Number(artist.score);
          const description=[clean(artist.disambiguation),clean(artist.type),clean(artist.country)].filter(Boolean).join(' · ').slice(0,160);
          return {id,name,description,score:Number.isFinite(score)?score:0};
        }).filter(Boolean).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
        const names=new Set(),ids=new Set(),result=[];
        for(const {score,...artist} of rows){const name=artist.name.toLocaleLowerCase('en');if(names.has(name)||ids.has(artist.id))continue;names.add(name);ids.add(artist.id);result.push(artist);if(result.length===10)break;}
        return result;
      })(),
      new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new ArtistSearchError('TIMEOUT','Artist search took too long. You can still add the artist manually.',504));controller.abort();},timeoutMs);})
    ]);
  }catch(error){if(error instanceof ArtistSearchError)throw error;fail('NETWORK_ERROR','Artist search is unavailable. You can still add the artist manually.');}
  finally{clearTimeout(timer);}
}
