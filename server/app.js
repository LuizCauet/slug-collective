import {searchArtists,ArtistSearchError} from './artist-search.js';
import {connectListenBrainz,syncListenBrainz,MusicError} from './music.js';
const DAY=86400000,MAX_BODY=32000;
const ROLE_SET=new Set(['Bass','DJ','Design','Drums','Film','Guitar','Illustration','Keys','Photography','Production','Songwriting','Vocals','Writing']);
class AppError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new AppError(status,code,message);};
const id=()=>crypto.randomUUID();
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const cookies=req=>Object.fromEntries((req.headers.get('Cookie')||'').split(';').map(s=>s.trim().split(/=(.*)/s)).filter(p=>p.length>1));
const cookie=(name,value,req,maxAge)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
const redirect=(path,headers={})=>new Response(null,{status:302,headers:{Location:path,...headers,'Cache-Control':'no-store'}});
const parse=value=>{try{return JSON.parse(value);}catch{return [];}};
const get=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
function text(value,max,field,required=false){if(typeof value!=='string'||value.length>max||/[\u0000]/.test(value))fail(400,'INVALID_FIELD',`Please check ${field}.`);const result=value.trim();if(required&&!result)fail(400,'INVALID_FIELD',`${field} is required.`);return result;}
function artistNames(values){if(!Array.isArray(values)||values.length>200)fail(400,'INVALID_ARTISTS','Choose at most 200 artists.');return [...new Map(values.map(a=>{const name=text(a,120,'artist',true).replace(/\s+/g,' ');return [name.normalize('NFKC').toLowerCase(),name];})).values()];}
function isAdmin(row,env){return (env.ADMIN_DISCORD_IDS||'').split(',').map(v=>v.trim()).includes(row.discord_id);}
function userView(row,env,self=false){const manual=parse(row.manual_artists),imported=parse(row.imported_artists),spotify=parse(row.spotify_artists);const names=[...new Map([...manual,...imported.map(v=>v.name),...spotify.map(v=>v.name)].map(name=>[name.normalize('NFKC').toLowerCase(),name])).values()];const view={id:row.id,name:row.name,avatar:row.avatar,bio:row.bio,pronouns:row.pronouns,college:row.college,roles:parse(row.roles),intent:row.intent,openToCollaborating:!!row.open_to_collaborating,artists:names,workTitle:row.work_title,workUrl:row.work_url,albums:[]};if(self)Object.assign(view,{manualArtists:manual,provider:row.provider_username?{name:'listenbrainz',username:row.provider_username,lastSyncedAt:row.last_synced_at}:null,spotify:row.spotify_imported_at?{artists:spotify,importedAt:row.spotify_imported_at}:null,isAdmin:isAdmin(row,env)});return view;}
async function readBody(req,maxBody=MAX_BODY){const declared=Number(req.headers.get('Content-Length'));if(declared>maxBody)fail(413,'TOO_LARGE','Request is too large.');if(!req.headers.get('Content-Type')?.includes('application/json'))fail(415,'JSON_REQUIRED','Send JSON data.');const reader=req.body?.getReader();if(!reader)return {};let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBody){await reader.cancel();fail(413,'TOO_LARGE','Request is too large.');}parts.push(value);}try{const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw 0;return body;}catch{fail(400,'INVALID_JSON','Request could not be read.');}}
async function rate(db,key,max,windowMs){const now=Date.now(),bucket=Math.floor(now/windowMs),row=await get(db,'INSERT INTO rate_limits(id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count',`${key}:${bucket}`,now+windowMs*2);if(row.count>max){const error=new AppError(429,'RATE_LIMITED','Too many requests. Please try again shortly.');error.retryAfter=Math.max(1,Math.ceil(((bucket+1)*windowMs-now)/1000));throw error;}}
async function validInvite(db,value,env){if(!value)return false;if(env.INITIAL_INVITE_CODE&&value===await hash(env.INITIAL_INVITE_CODE))return true;return !!await get(db,'SELECT id FROM invites WHERE token_hash=? AND revoked=0 AND expires_at>?',value,Date.now());}
async function blocked(db,a,b){return !!await get(db,'SELECT blocker_id FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',a,b,b,a);}
async function session(req,env){const raw=cookies(req).slug_session;if(!raw)return null;return get(env.DB,'SELECT s.id AS session_id,s.csrf,s.expires_at,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?',await hash(raw),Date.now());}
function requireOrigin(req,env){const origin=req.headers.get('Origin');if(!origin||origin!==new URL(env.APP_ORIGIN||req.url).origin)fail(403,'BAD_ORIGIN','Please reload the app and try again.');}
async function authorize(req,env,mutation=false){const user=await session(req,env);if(!user)fail(401,'SIGN_IN_REQUIRED','Sign in to continue.');if(mutation){requireOrigin(req,env);if(req.headers.get('X-CSRF-Token')!==user.csrf)fail(403,'BAD_CSRF','Please reload the app and try again.');}return user;}
async function threadFor(db,threadId,userId){const t=await get(db,'SELECT * FROM threads WHERE id=? AND (user_a=? OR user_b=?)',threadId,userId,userId);if(!t)fail(404,'NOT_FOUND','Conversation not found.');const other=t.user_a===userId?t.user_b:t.user_a;if(await blocked(db,userId,other))fail(403,'BLOCKED','This conversation is unavailable.');return t;}
function configured(env){return !!(env.DISCORD_CLIENT_ID&&env.DISCORD_CLIENT_SECRET&&env.APP_ORIGIN);}
async function cleanupExpired(db){
 const now=Date.now();
 // Bound each pass; stale records are removed gradually without long request locks.
 await db.batch([...['oauth_states','sessions','rate_limits'].map(table=>db.prepare(`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE expires_at<=? LIMIT 100)`).bind(now)),db.prepare('DELETE FROM artist_search_cache WHERE query IN (SELECT query FROM artist_search_cache WHERE expires_at<=? LIMIT 100)').bind(now)]);
}
export function createApp({fetcher=fetch,staticHandler=()=>new Response('Not found',{status:404})}={}){
 let nextCleanup=0;
 async function handle(req,env){
  const url=new URL(req.url),path=url.pathname,method=req.method,db=env.DB;
  if(db&&Date.now()>=nextCleanup){nextCleanup=Date.now()+60000;try{await cleanupExpired(db);}catch{nextCleanup=0;}}
  if(path==='/auth/discord'||path==='/auth/discord/callback'){
   if(method!=='GET')return json({error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}},405,{Allow:'GET'});
   // Cloudflare replaces this header at its edge. Never use caller-controlled forwarding headers.
   const ip=req.headers.get('CF-Connecting-IP')||'local';
   await rate(db,`auth:${await hash(ip)}`,60,60000);
  }
  if(path==='/api/config')return json({discordConfigured:configured(env),siteOrigin:env.APP_ORIGIN||url.origin,clubName:'Slug Collective'});
  if(path==='/api/health')return json({ok:true,service:'slug-collective'});
  if(path==='/auth/discord'){
   if(!configured(env))return redirect('/?error=discord_not_configured');
   const invite=url.searchParams.get('invite');if(invite&&invite.length>200)fail(400,'INVALID_INVITE','Invalid invite.');
   const state=token(),stateHash=await hash(state);await run(db,'INSERT INTO oauth_states(id,invite_hash,expires_at) VALUES (?,?,?)',stateHash,invite?await hash(invite):null,Date.now()+600000);
   const auth=new URL('https://discord.com/oauth2/authorize');auth.search=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,redirect_uri:`${env.APP_ORIGIN}/auth/discord/callback`,response_type:'code',scope:'identify',state}).toString();
   return redirect(auth.href,{'Set-Cookie':cookie('slug_oauth',stateHash,req,600)});
  }
  if(path==='/auth/discord/callback'){
   if(!configured(env))return redirect('/?error=discord_not_configured');
   const state=url.searchParams.get('state'),code=url.searchParams.get('code'),issuer=url.searchParams.get('iss');if(!state||!code||state.length>200||code.length>2048||(issuer!==null&&issuer!=='https://discord.com')||cookies(req).slug_oauth!==await hash(state))return redirect('/?error=invalid_login');
   const attempt=await get(db,'DELETE FROM oauth_states WHERE id=? AND expires_at>? RETURNING *',await hash(state),Date.now());if(!attempt)return redirect('/?error=expired_login');
   try{
    const response=await fetcher('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:`${env.APP_ORIGIN}/auth/discord/callback`}),signal:AbortSignal.timeout(12000)});
    if(!response.ok)return redirect('/?error=discord_login_failed');const grant=await response.json();if(!grant.access_token)return redirect('/?error=discord_login_failed');
    const accountResponse=await fetcher('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${grant.access_token}`},signal:AbortSignal.timeout(12000)});if(!accountResponse.ok)return redirect('/?error=discord_login_failed');const account=await accountResponse.json();if(!/^\d{1,30}$/.test(account.id))return redirect('/?error=discord_login_failed');
    let user=await get(db,'SELECT * FROM users WHERE discord_id=?',account.id);
    if(!user){if(!await validInvite(db,attempt.invite_hash,env))return redirect('/?error=invite_required');const uid=id(),now=Date.now();const avatar=account.avatar&&/^[a-zA-Z0-9_]+$/.test(account.avatar)?`https://cdn.discordapp.com/avatars/${account.id}/${account.avatar}.png?size=128`:'';await run(db,'INSERT INTO users(id,discord_id,name,avatar,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(discord_id) DO NOTHING',uid,account.id,String(account.global_name||account.username||'Slug').slice(0,40),avatar,now,now);user=await get(db,'SELECT * FROM users WHERE discord_id=?',account.id);}
    const raw=token();await run(db,'INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES (?,?,?,?)',await hash(raw),user.id,token(),Date.now()+DAY*30);
    const result=redirect('/');result.headers.append('Set-Cookie',cookie('slug_session',raw,req,2592000));result.headers.append('Set-Cookie',cookie('slug_oauth','',req,0));return result;
   }catch{return redirect('/?error=discord_login_failed');}
  }
  if(path==='/api/me'&&method==='GET'){const u=await session(req,env);return u?json({authenticated:true,user:userView(u,env,true),csrf:u.csrf}):json({authenticated:false});}
  if(!path.startsWith('/api/'))return staticHandler(req,env);
  const mutation=!['GET','HEAD'].includes(method),u=await authorize(req,env,mutation),uid=u.id;
  if(mutation)await rate(db,`write:${uid}`,120,60000);
  if(path==='/api/logout'&&method==='POST'){await run(db,'DELETE FROM sessions WHERE id=?',u.session_id);return json({ok:true},200,{'Set-Cookie':cookie('slug_session','',req,0)});}
  if(path==='/api/me'&&method==='DELETE'){await run(db,'DELETE FROM users WHERE id=?',uid);return json({ok:true},200,{'Set-Cookie':cookie('slug_session','',req,0)});}
  if(path==='/api/artists/search'){
   if(method!=='GET')fail(405,'METHOD_NOT_ALLOWED','Method not allowed.');
   const raw=url.searchParams.get('q')||'',query=raw.normalize('NFKC').replace(/\s+/g,' ').trim();
   if(/[\u0000-\u001f\u007f]/.test(raw)||query.length<2||query.length>80)fail(400,'INVALID_QUERY','Search using 2 to 80 characters.');
   await rate(db,`artist-search:${uid}`,90,60000);
   const key=query.toLowerCase(),cached=await get(db,'SELECT data FROM artist_search_cache WHERE query=? AND expires_at>?',key,Date.now());
   if(cached)return json({artists:parse(cached.data),source:'MusicBrainz / Apple'});
   // Reuse complete artist names found in other searches, while partial queries still discover fresh results.
   const known=await all(db,"SELECT artist.value AS data FROM (SELECT data FROM artist_search_cache WHERE expires_at>? ORDER BY expires_at DESC LIMIT 1000) AS cache, json_each(CASE WHEN json_valid(cache.data) THEN cache.data ELSE '[]' END) AS artist WHERE json_type(artist.value,'$.name')='text' AND lower(json_extract(artist.value,'$.name'))=? LIMIT 10",Date.now(),key);
   const names=new Set(),reused=[];
   for(const row of known){const artist=parse(row.data),name=typeof artist.name==='string'?artist.name.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase():'';if(name===key&&!names.has(name)){names.add(name);reused.push(artist);}}
   if(reused.length)return json({artists:reused,source:'MusicBrainz / Apple'});

   const now=Date.now(),reservation=await get(db,'INSERT INTO rate_limits(id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET expires_at=MAX(rate_limits.expires_at,?)+1100 WHERE rate_limits.expires_at<=? RETURNING expires_at-1100 AS slot','artist-provider',now+1100,now,now+1500);
   if(!reservation)throw new ArtistSearchError('PROVIDER_UNAVAILABLE','Artist search is busy. Please try again shortly.',429,2);
   const wait=Math.max(0,reservation.slot-Date.now());if(wait>1500)throw new ArtistSearchError('PROVIDER_UNAVAILABLE','Artist search is busy. Please try again shortly.',429,2);
   if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
   const artists=await searchArtists(query,{fetcher,userAgent:`SlugCollective/1.0 (${env.MUSIC_CONTACT_URL||env.APP_ORIGIN})`,reserveFallback:()=>rate(db,'artist-apple-provider',20,60000)});
   await run(db,'INSERT INTO artist_search_cache(query,data,expires_at) VALUES (?,?,?) ON CONFLICT(query) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at',key,JSON.stringify(artists),Date.now()+DAY*7);
   return json({artists,source:'MusicBrainz / Apple'});
  }
  if(path==='/api/members'&&method==='GET'){const rows=await all(db,'SELECT * FROM users WHERE id<>? AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?) AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?) ORDER BY created_at DESC LIMIT 2000',uid,uid,uid);return json({members:rows.map(row=>userView(row,env))});}
  if(path==='/api/profile'&&method==='PUT'){
   const b=await readBody(req),name=text(b.name,40,'Name',true),bio=text(b.bio??'',300,'Bio'),pronouns=text(b.pronouns??'',40,'Pronouns'),college=text(b.college??'',80,'College'),intent=text(b.intent??'',160,'Open to'),workTitle=text(b.workTitle??'',100,'Work title'),workUrl=text(b.workUrl??'',1000,'Work link');
   if(!Array.isArray(b.roles)||b.roles.length>ROLE_SET.size||b.roles.some(r=>!ROLE_SET.has(r)))fail(400,'INVALID_ROLES','Please choose valid creative roles.');const roles=[...new Set(b.roles)];if(typeof b.openToCollaborating!=='boolean')fail(400,'INVALID_FIELD','Choose whether you are open to collaborating.');if(b.openToCollaborating&&!roles.length)fail(400,'ROLE_REQUIRED','Choose at least one role to appear on Create.');
   if(workUrl){let link;try{link=new URL(workUrl);}catch{fail(400,'INVALID_URL','Use a full HTTPS link for your work.');}if(link.protocol!=='https:'||link.username||link.password)fail(400,'INVALID_URL','Use a full HTTPS link for your work.');}
   const artists=artistNames(b.artists??[]);await run(db,'UPDATE users SET name=?,bio=?,pronouns=?,college=?,roles=?,intent=?,open_to_collaborating=?,manual_artists=?,work_title=?,work_url=?,updated_at=? WHERE id=?',name,bio,pronouns,college,JSON.stringify(roles),intent,b.openToCollaborating?1:0,JSON.stringify(artists),workTitle,workUrl,Date.now(),uid);return json({user:userView(await get(db,'SELECT * FROM users WHERE id=?',uid),env,true)});
  }
  if(path==='/api/threads'&&method==='GET'){
   const rows=await all(db,'SELECT * FROM threads WHERE user_a=? OR user_b=? ORDER BY updated_at DESC',uid,uid),threads=[];
   for(const t of rows){const other=t.user_a===uid?t.user_b:t.user_a;if(await blocked(db,uid,other))continue;const member=await get(db,'SELECT * FROM users WHERE id=?',other);if(!member)continue;const last=await get(db,'SELECT text,created_at FROM messages WHERE thread_id=? ORDER BY created_at DESC,id DESC LIMIT 1',t.id);const read=t.user_a===uid?t.a_read_at:t.b_read_at;const count=await get(db,'SELECT count(*) AS n FROM messages WHERE thread_id=? AND sender_id<>? AND created_at>?',t.id,uid,read);threads.push({id:t.id,member:{id:member.id,name:member.name,avatar:member.avatar},lastMessage:last?.text||'',unreadCount:count.n,context:t.context});}return json({threads});
  }
  if(path==='/api/threads'&&method==='POST'){
   const b=await readBody(req),other=text(b.memberId,80,'Member',true),context=text(b.context??'',300,'Context');if(other===uid||!await get(db,'SELECT id FROM users WHERE id=?',other))fail(404,'NOT_FOUND','Member not found.');if(await blocked(db,uid,other))fail(403,'BLOCKED','This conversation is unavailable.');await rate(db,`new-thread:${uid}`,30,3600000);const pair=[uid,other].sort(),now=Date.now();await run(db,'INSERT INTO threads(id,user_a,user_b,context,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_a,user_b) DO NOTHING',id(),pair[0],pair[1],context,now,now);const t=await get(db,'SELECT * FROM threads WHERE user_a=? AND user_b=?',...pair);return json({thread:{id:t.id,context:t.context}},201);
  }
  const messagePath=path.match(/^\/api\/threads\/([^/]+)\/messages$/);
  if(messagePath){const t=await threadFor(db,messagePath[1],uid);if(method==='GET'){const readCutoff=Date.now();const rows=await all(db,'SELECT * FROM messages WHERE thread_id=? ORDER BY created_at DESC,id DESC LIMIT 200',t.id);const messages=rows.reverse().map(r=>({id:r.id,senderId:r.sender_id,text:r.text,createdAt:r.created_at}));await run(db,`UPDATE threads SET ${t.user_a===uid?'a_read_at':'b_read_at'}=? WHERE id=?`,readCutoff,t.id);return json({messages});}if(method==='POST'){const b=await readBody(req),value=text(b.text,2000,'Message',true),clientId=text(b.clientId,100,'Message identifier',true);const previous=await get(db,'SELECT * FROM messages WHERE sender_id=? AND client_id=?',uid,clientId);if(previous){if(previous.thread_id!==t.id)fail(409,'DUPLICATE_ID','Please retry with a new message identifier.');return json({message:{id:previous.id,senderId:uid,text:previous.text,createdAt:previous.created_at}});}await rate(db,`message:${uid}`,30,60000);const mid=id(),now=Date.now();await db.batch([db.prepare('INSERT INTO messages(id,thread_id,sender_id,text,client_id,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(sender_id,client_id) DO NOTHING').bind(mid,t.id,uid,value,clientId,now),db.prepare('UPDATE threads SET updated_at=? WHERE id=?').bind(now,t.id)]);const saved=await get(db,'SELECT * FROM messages WHERE sender_id=? AND client_id=?',uid,clientId);if(saved.thread_id!==t.id)fail(409,'DUPLICATE_ID','Please retry with a new message identifier.');return json({message:{id:saved.id,senderId:uid,text:saved.text,createdAt:saved.created_at}},saved.id===mid?201:200);}}
  if(path==='/api/blocks'&&method==='POST'){const b=await readBody(req),other=text(b.memberId,80,'Member',true);if(other===uid||!await get(db,'SELECT id FROM users WHERE id=?',other))fail(404,'NOT_FOUND','Member not found.');await run(db,'INSERT INTO blocks(blocker_id,blocked_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING',uid,other,Date.now());return json({ok:true});}
  if(path==='/api/reports'&&method==='POST'){const b=await readBody(req),other=text(b.memberId,80,'Member',true),reason=text(b.reason,1000,'Reason',true);if(other===uid||!await get(db,'SELECT id FROM users WHERE id=?',other))fail(404,'NOT_FOUND','Member not found.');await rate(db,`reports:${uid}`,5,3600000);await run(db,'INSERT INTO reports(id,reporter_id,member_id,reason,created_at) VALUES (?,?,?,?,?)',id(),uid,other,reason,Date.now());return json({ok:true});}
  if(path==='/api/feedback'&&method==='POST'){const b=await readBody(req),memberId=text(b.memberId,80,'Member',true);if(typeof b.helpful!=='boolean'||!await get(db,'SELECT id FROM users WHERE id=? AND id<>?',memberId,uid))fail(400,'INVALID_FEEDBACK','Please choose a valid member.');await run(db,'INSERT INTO feedback(id,user_id,member_id,helpful,created_at) VALUES (?,?,?,?,?)',id(),uid,memberId,b.helpful?1:0,Date.now());return json({ok:true});}
  if(path==='/api/music/spotify'){
   if(method==='POST'){
    const body=await readBody(req,128000);if(!Array.isArray(body.artists)||body.artists.length>200)fail(400,'INVALID_ARTISTS','Import at most 200 artists.');
    const unique=new Map();
    for(const item of body.artists){
     if(!item||typeof item!=='object'||Array.isArray(item))fail(400,'INVALID_ARTISTS','Please check the imported artists.');
     const name=text(item.name,120,'Artist',true).normalize('NFKC').replace(/\s+/g,' ').trim();
     if(!name||name.length>120||!Number.isSafeInteger(item.plays)||item.plays<=0||!Number.isSafeInteger(item.msPlayed)||item.msPlayed<0)fail(400,'INVALID_ARTISTS','Please check the imported artist counts.');
     const key=name.toLowerCase(),previous=unique.get(key);
     unique.set(key,{name:previous?.name||name,plays:Math.max(previous?.plays||0,item.plays),msPlayed:Math.max(previous?.msPlayed||0,item.msPlayed)});
    }
    await run(db,'UPDATE users SET spotify_artists=?,spotify_imported_at=? WHERE id=?',JSON.stringify([...unique.values()]),Date.now(),uid);
   }else if(method==='DELETE')await run(db,'UPDATE users SET spotify_artists=?,spotify_imported_at=NULL WHERE id=?','[]',uid);
   else fail(405,'METHOD_NOT_ALLOWED','Method not allowed.');
   return json({user:userView(await get(db,'SELECT * FROM users WHERE id=?',uid),env,true)});
  }
  if(path.startsWith('/api/music/listenbrainz')){
   const options={fetcher,userAgent:`SlugCollective/1.0 (${env.MUSIC_CONTACT_URL||env.APP_ORIGIN})`};
   if(path==='/api/music/listenbrainz'&&method==='DELETE'){await run(db,'UPDATE users SET provider_username=NULL,last_synced_at=NULL,imported_artists=?,music_revision=music_revision+1 WHERE id=?','[]',uid);return json({user:userView(await get(db,'SELECT * FROM users WHERE id=?',uid),env,true)});}
   if(method!=='POST')fail(405,'METHOD_NOT_ALLOWED','Method not allowed.');await rate(db,`music:${uid}`,1,60000);const reservation=await get(db,'UPDATE users SET music_revision=music_revision+1 WHERE id=? RETURNING music_revision',uid);let result;
   if(path==='/api/music/listenbrainz/connect'){const b=await readBody(req);result=await connectListenBrainz({...options,token:b.token});}
   else if(path==='/api/music/listenbrainz/sync'){if(!u.provider_username)fail(400,'NOT_CONNECTED','Connect ListenBrainz first.');result=await syncListenBrainz({...options,username:u.provider_username});}
   else fail(404,'NOT_FOUND','Not found.');const saved=await run(db,'UPDATE users SET provider_username=?,imported_artists=?,last_synced_at=? WHERE id=? AND music_revision=?',result.username,JSON.stringify(result.artists),result.lastSyncedAt,uid,reservation.music_revision);if(!saved.meta.changes)fail(409,'SYNC_SUPERSEDED','This sync was discarded because your music connection changed.');return json({user:userView(await get(db,'SELECT * FROM users WHERE id=?',uid),env,true)});
  }
  if(path.startsWith('/api/admin/')){
   if(!isAdmin(u,env))fail(403,'FORBIDDEN','Admin access required.');
   if(path==='/api/admin/invites'&&method==='GET')return json({invites:await all(db,'SELECT id,created_at AS createdAt,expires_at AS expiresAt,revoked FROM invites ORDER BY created_at DESC')});
   if(path==='/api/admin/invites'&&method==='POST'){const raw=token(),iid=id(),now=Date.now(),expires=now+DAY*30;await run(db,'INSERT INTO invites(id,token_hash,created_by,created_at,expires_at) VALUES (?,?,?,?,?)',iid,await hash(raw),uid,now,expires);return json({invite:{id:iid,url:`${env.APP_ORIGIN}/?invite=${raw}`,expiresAt:expires}},201);}
   const invitePath=path.match(/^\/api\/admin\/invites\/([^/]+)$/);if(invitePath&&method==='DELETE'){await run(db,'UPDATE invites SET revoked=1 WHERE id=?',invitePath[1]);return json({ok:true});}
   if(path==='/api/admin/reports'&&method==='GET')return json({reports:await all(db,'SELECT r.*,u.name AS memberName,p.name AS reporterName FROM reports r LEFT JOIN users u ON u.id=r.member_id LEFT JOIN users p ON p.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 200')});
  }
  fail(404,'NOT_FOUND','Not found.');
 }
 return {async fetch(req,env,ctx){let response;try{response=await handle(req,env,ctx);}catch(e){if(e instanceof AppError||e instanceof MusicError||e instanceof ArtistSearchError)response=json({error:{code:e.code,message:e.message}},e.status,e.retryAfter?{'Retry-After':String(e.retryAfter)}:{});else{console.error('Request failed',e?.name||'Error');response=json({error:{code:'SERVER_ERROR',message:'Something went wrong. Please try again.'}},500);}}const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');headers.set('X-Frame-Options','SAMEORIGIN');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");return new Response(response.body,{status:response.status,headers});}};
}
export default createApp();
