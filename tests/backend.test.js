import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {createApp} from '../server/app.js';

let mf, db, env, app;
const origin='https://club.example';
const accounts=new Map();
const jar=response=>{const cookies=response.headers.getSetCookie();return cookies.filter(v=>!v.includes('Max-Age=0')).map(v=>v.split(';')[0]).join('; ');};
async function request(path,{member,method='GET',body,csrf=true,originHeader=origin}={}){
 const headers={};if(member){headers.Cookie=member.cookie;if(csrf)headers['X-CSRF-Token']=member.csrf;}
 if(method!=='GET')headers.Origin=originHeader;
 if(body!==undefined)headers['Content-Type']='application/json';
 const response=await app.fetch(new Request(origin+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,{});
 return response;
}
async function login(discordId,{invite='secret-club-invite'}={}){
 accounts.set(discordId,{id:discordId,username:`slug${discordId}`,global_name:`Member ${discordId}`});
 const start=await app.fetch(new Request(origin+'/auth/discord'+(invite?`?invite=${invite}`:''),{headers:{'CF-Connecting-IP':`192.0.2.${Number(discordId)%250}`}}),env,{});
 const state=new URL(start.headers.get('Location')).searchParams.get('state');
 const response=await app.fetch(new Request(`${origin}/auth/discord/callback?state=${state}&code=${discordId}`,{headers:{Cookie:jar(start),'CF-Connecting-IP':`192.0.2.${Number(discordId)%250}`}}),env,{});
 if(!jar(response))return {response};
 const cookie=jar(response),me=await (await app.fetch(new Request(origin+'/api/me',{headers:{Cookie:cookie}}),env,{})).json();
 return {response,cookie,csrf:me.csrf,user:me.user};
}
const profile=(extra={})=>({name:'A Slug',bio:'',pronouns:'',college:'',roles:[],intent:'',openToCollaborating:false,artists:['Clairo'],workTitle:'',workUrl:'',...extra});
before(async()=>{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2024-12-30',d1Databases:['DB']});
 db=await mf.getD1Database('DB');
 for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
  const sql=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');
  for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 }
 env={DB:db,APP_ORIGIN:origin,DISCORD_CLIENT_ID:'test-client',DISCORD_CLIENT_SECRET:'test-secret',INITIAL_INVITE_CODE:'secret-club-invite',ADMIN_DISCORD_IDS:'100'};
 app=createApp({fetcher:async(url,options)=>{
  if(url.endsWith('/oauth2/token'))return Response.json({access_token:new URLSearchParams(options.body).get('code')});
  if(url.endsWith('/users/@me'))return Response.json(accounts.get(options.headers.Authorization.split(' ')[1]));
  throw new Error('Unexpected upstream request');
 }});
});
after(async()=>{await mf?.dispose();});

test('anonymous access never exposes members, threads, or privileged endpoints',async()=>{
 assert.deepEqual(await (await request('/api/me')).json(),{authenticated:false});
 for(const path of ['/api/members','/api/threads','/api/admin/reports'])assert.equal((await request(path)).status,401);
 assert.equal((await request('/api/profile',{method:'PUT',body:profile()})).status,401);
});
test('OAuth requires matching browser state and a valid invite for first registration',async()=>{
 const missing=await request('/auth/discord/callback?state=forged&code=100');assert.match(missing.headers.get('Location'),/invalid_login/);
 const denied=await login('101',{invite:null});assert.match(denied.response.headers.get('Location'),/invite_required/);
 const member=await login('101');assert.equal(member.user.name,'Member 101');
 assert.match(member.response.headers.get('Set-Cookie'),/HttpOnly/);assert.match(member.response.headers.get('Set-Cookie'),/Secure/);
 const returning=await login('101',{invite:null});assert.equal(returning.user.id,member.user.id);
 const start=await request('/auth/discord?invite=secret-club-invite'),state=new URL(start.headers.get('Location')).searchParams.get('state');
 const callback=new Request(`${origin}/auth/discord/callback?state=${state}&code=101`,{headers:{Cookie:jar(start)}});
 assert.equal((await app.fetch(callback,env,{})).headers.get('Location'),'/');
 assert.match((await app.fetch(callback,env,{})).headers.get('Location'),/expired_login/);
});
test('profile writes require CSRF and same-origin, validate opt-in and work URLs, and persist',async()=>{
 const a=await login('102');
 assert.equal((await request('/api/profile',{member:a,method:'PUT',body:profile(),csrf:false})).status,403);
 assert.equal((await request('/api/profile',{member:a,method:'PUT',body:profile(),originHeader:'https://evil.example'})).status,403);
 for(const fields of [{roles:['Root']},{openToCollaborating:true},{workUrl:'javascript:alert(1)'},{workUrl:'https://user:pass@example.com'}])assert.equal((await request('/api/profile',{member:a,method:'PUT',body:profile(fields)})).status,400);
 const response=await request('/api/profile',{member:a,method:'PUT',body:profile({roles:['Guitar'],openToCollaborating:true,artists:['Clairo','clairo','  Wednesday  ']})});
 assert.equal(response.status,200);const saved=(await response.json()).user;assert.deepEqual(saved.manualArtists,['clairo','Wednesday']);assert.equal(saved.openToCollaborating,true);
 const observer=await login('103');const members=(await (await request('/api/members',{member:observer})).json()).members;
 assert.equal(members.find(m=>m.id===a.user.id).openToCollaborating,true);assert.equal(members.find(m=>m.id===a.user.id).manualArtists,undefined);
 assert.equal((await request('/api/admin/reports',{member:a})).status,403);
});
test('conversations isolate members, deduplicate sends, preserve messages, and enforce blocks',async()=>{
 const a=await login('104'),b=await login('105'),stranger=await login('106');
 const created=await request('/api/threads',{member:a,method:'POST',body:{memberId:b.user.id,context:'Clairo'}});assert.equal(created.status,201);
 const thread=(await created.json()).thread,path=`/api/threads/${thread.id}/messages`;
 const reverse=(await (await request('/api/threads',{member:b,method:'POST',body:{memberId:a.user.id}})).json()).thread;assert.equal(reverse.id,thread.id);
 for(const method of ['GET','POST'])assert.equal((await request(path,{member:stranger,method,...(method==='POST'?{body:{text:'intrusion',clientId:'evil'}}:{})})).status,404);
 const body={text:'That album is fire',clientId:'retry-me'};
 assert.equal((await request(path,{member:a,method:'POST',body})).status,201);assert.equal((await request(path,{member:a,method:'POST',body})).status,200);
 const messages=(await (await request(path,{member:b})).json()).messages;assert.equal(messages.length,1);assert.equal(messages[0].text,body.text);
 assert.equal((await request('/api/blocks',{member:b,method:'POST',body:{memberId:a.user.id}})).status,200);
 assert.equal((await request(path,{member:a,method:'POST',body:{text:'blocked',clientId:'new'}})).status,403);
 assert.equal((await request(path,{member:b})).status,403);
 assert.equal((await (await request('/api/threads',{member:a})).json()).threads.length,0);
 assert.ok(!(await (await request('/api/members',{member:a})).json()).members.some(m=>m.id===b.user.id));
});
test('admin invites can be revoked and account deletion invalidates sessions',async()=>{
 const admin=await login('100');const made=await request('/api/admin/invites',{member:admin,method:'POST'});assert.equal(made.status,201);
 const invite=(await made.json()).invite,code=new URL(invite.url).searchParams.get('invite');
 assert.ok((await login('107',{invite:code})).user);
 assert.equal((await request(`/api/admin/invites/${invite.id}`,{member:admin,method:'DELETE'})).status,200);
 assert.match((await login('108',{invite:code})).response.headers.get('Location'),/invite_required/);
 const deleted=await login('109');assert.equal((await request('/api/me',{member:deleted,method:'DELETE'})).status,200);
 assert.deepEqual(await (await request('/api/me',{member:deleted})).json(),{authenticated:false});
 assert.equal((await request('/api/members',{member:deleted})).status,401);
});

test('expired sessions are rejected, reports and feedback persist, and logout revokes session',async()=>{
 const a=await login('110'),b=await login('111'),admin=await login('100');
 assert.equal((await request('/api/reports',{member:a,method:'POST',body:{memberId:b.user.id,reason:'Unwanted contact'}})).status,200);
 assert.equal((await request('/api/feedback',{member:a,method:'POST',body:{memberId:b.user.id,helpful:true}})).status,200);
 assert.equal((await request('/api/feedback',{member:a,method:'POST',body:{memberId:b.user.id,helpful:'yes'}})).status,400);
 const reports=(await (await request('/api/admin/reports',{member:admin})).json()).reports;
 assert.ok(reports.some(r=>r.member_id===b.user.id&&r.reason==='Unwanted contact'));
 assert.equal((await db.prepare('SELECT count(*) AS n FROM feedback WHERE user_id=? AND member_id=?').bind(a.user.id,b.user.id).first()).n,1);
 await db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').bind(b.user.id).run();
 assert.equal((await request('/api/threads',{member:b})).status,401);
 assert.equal((await request('/api/logout',{member:a,method:'POST'})).status,200);
 assert.equal((await request('/api/members',{member:a})).status,401);
});

test('concurrent message retries return one persisted message and reject cross-thread client IDs',async()=>{
 const a=await login('120'),b=await login('121'),c=await login('122');
 const thread=async other=>(await (await request('/api/threads',{member:a,method:'POST',body:{memberId:other.user.id}})).json()).thread.id;
 const first=await thread(b),second=await thread(c),body={text:'One message',clientId:'concurrent-client-id'};
 const responses=await Promise.all(Array.from({length:4},()=>request(`/api/threads/${first}/messages`,{member:a,method:'POST',body})));
 assert.ok(responses.every(r=>[200,201].includes(r.status)));
 const values=await Promise.all(responses.map(r=>r.json()));assert.equal(new Set(values.map(v=>v.message.id)).size,1);
 assert.equal((await (await request(`/api/threads/${first}/messages`,{member:b})).json()).messages.length,1);
 assert.equal((await request(`/api/threads/${second}/messages`,{member:a,method:'POST',body})).status,409);
});
test('OAuth endpoints reject non-GET requests and invalid issuer or oversized codes',async()=>{
 for(const route of ['/auth/discord','/auth/discord/callback'])assert.equal((await request(route,{method:'POST'})).status,405);
 const start=await request('/auth/discord?invite=secret-club-invite'),state=new URL(start.headers.get('Location')).searchParams.get('state');
 for(const suffix of ['&code=100&iss=https%3A%2F%2Fevil.example','&code='+ 'x'.repeat(2049)]){
  const response=await app.fetch(new Request(`${origin}/auth/discord/callback?state=${state}${suffix}`,{headers:{Cookie:jar(start)}}),env,{});
  assert.match(response.headers.get('Location'),/invalid_login/);
 }
});
test('auth attempts are bounded by trusted edge IP, ignoring spoofed forwarded headers',async()=>{
 let limited;
 for(let n=0;n<61;n++){
  limited=await app.fetch(new Request(origin+'/auth/discord',{headers:{'CF-Connecting-IP':'192.0.2.17','X-Forwarded-For':`192.0.2.${n}`}}),env,{});
 }
 assert.equal(limited.status,429);
 assert.equal((await app.fetch(new Request(origin+'/auth/discord',{headers:{'CF-Connecting-IP':'192.0.2.18'}}),env,{})).status,302);
});
test('expired record cleanup is bounded and preserves current sessions',async()=>{
 const member=await login('123');
 const expired=Array.from({length:125},(_,n)=>db.prepare('INSERT INTO oauth_states(id,expires_at) VALUES (?,0)').bind('expired-'+n));
 await db.batch(expired);
 await db.batch(Array.from({length:125},(_,n)=>db.prepare('INSERT INTO artist_search_cache(query,data,expires_at) VALUES (?, ?, 0)').bind('expired-cache-'+n,'[]')));
 await db.prepare('INSERT INTO rate_limits(id,count,expires_at) VALUES (?,1,0)').bind('expired-rate').run();
 const isolated=createApp();
 const response=await isolated.fetch(new Request(origin+'/api/me',{headers:{Cookie:member.cookie}}),env,{});assert.equal((await response.json()).authenticated,true);
 assert.equal((await db.prepare("SELECT count(*) AS n FROM oauth_states WHERE id LIKE 'expired-%'").first()).n,25);
 assert.equal(await db.prepare("SELECT id FROM rate_limits WHERE id='expired-rate'").first(),null);
 assert.equal((await db.prepare("SELECT count(*) AS n FROM artist_search_cache WHERE query LIKE 'expired-cache-%'").first()).n,25);
});

test('feedback rejects a missing or malformed member identifier without server errors',async()=>{
 const member=await login('124');
 for(const memberId of [undefined,null,{},'',123]){
  const response=await request('/api/feedback',{member,method:'POST',body:{helpful:true,...(memberId===undefined?{}:{memberId})}});
  assert.equal(response.status,400);
 }
});
test('a message arriving during a read remains unread until a subsequent fetch',async()=>{
 const a=await login('125'),b=await login('126');
 const thread=(await (await request('/api/threads',{member:a,method:'POST',body:{memberId:b.user.id}})).json()).thread;
 let inserted=false;
 const raceDb={prepare(sql){
  const statement=db.prepare(sql);
  if(!sql.startsWith('SELECT * FROM messages WHERE thread_id='))return statement;
  return {bind(...args){const bound=statement.bind(...args);return {async all(){
   const result=await bound.all();
   if(!inserted){inserted=true;await new Promise(resolve=>setTimeout(resolve,5));await db.prepare('INSERT INTO messages(id,thread_id,sender_id,text,client_id,created_at) VALUES (?,?,?,?,?,?)').bind('during-read',thread.id,b.user.id,'Arrived during read','during-read',Date.now()).run();}
   return result;
  }};}};
 },batch:db.batch.bind(db)};
 const isolated=createApp();
 const response=await isolated.fetch(new Request(`${origin}/api/threads/${thread.id}/messages`,{headers:{Cookie:a.cookie}}),{...env,DB:raceDb},{});
 assert.equal(response.status,200);assert.equal((await response.json()).messages.length,0);
 const list=(await (await request('/api/threads',{member:a})).json()).threads;
 assert.equal(list.find(t=>t.id===thread.id).unreadCount,1);
 assert.equal((await (await request(`/api/threads/${thread.id}/messages`,{member:a})).json()).messages.length,1);
 assert.equal((await (await request('/api/threads',{member:a})).json()).threads.find(t=>t.id===thread.id).unreadCount,0);
});

test('disconnect wins over an in-flight music import',async()=>{
 const member=await login('127');
 let release,entered;
 const waiting=new Promise(resolve=>{release=resolve;});
 const started=new Promise(resolve=>{entered=resolve;});
 const isolated=createApp({fetcher:async url=>{
  if(url.endsWith('/validate-token'))return Response.json({valid:true,user_name:'test-slug'});
  entered();await waiting;
  return Response.json({payload:{artists:[{artist_name:'Deep Cut',listen_count:10}]}});
 }});
 const headers={Cookie:member.cookie,Origin:origin,'X-CSRF-Token':member.csrf,'Content-Type':'application/json'};
 const sync=isolated.fetch(new Request(origin+'/api/music/listenbrainz/connect',{method:'POST',headers,body:JSON.stringify({token:'00000000-0000-4000-8000-000000000001'})}),env,{});
 await started;
 try{assert.equal((await request('/api/music/listenbrainz',{member,method:'DELETE'})).status,200);}finally{release();}
 const response=await sync;assert.equal(response.status,409);
 const current=(await (await request('/api/me',{member})).json()).user;
 assert.equal(current.provider,null);assert.deepEqual(current.artists,[]);
});

test('Spotify summary import validates input, isolates private counts, and coexists with manual and ListenBrainz',async()=>{
 const a=await login('128'),b=await login('129');
 const body={artists:[{name:'  Clairo  ',plays:10,msPlayed:200000},{name:'clairo',plays:8,msPlayed:150000},{name:'Only Spotify',plays:2,msPlayed:10000}],rawHistory:'must not persist',email:'private@example.com'};
 assert.equal((await request('/api/music/spotify',{method:'POST',body})).status,401);
 assert.equal((await request('/api/music/spotify',{member:a,method:'POST',body,csrf:false})).status,403);
 await request('/api/profile',{member:a,method:'PUT',body:profile({artists:['Manual Only']})});
 await db.prepare('UPDATE users SET imported_artists=?,provider_username=?,last_synced_at=? WHERE id=?').bind(JSON.stringify([{name:'ListenBrainz Only',plays:5,mbid:null}]),'some-slug',123,a.user.id).run();
 const imported=await request('/api/music/spotify',{member:a,method:'POST',body});assert.equal(imported.status,200);
 const user=(await imported.json()).user;assert.equal(user.spotify.artists.length,2);assert.equal(user.spotify.artists[0].plays,10);assert.deepEqual(new Set(user.artists),new Set(['Manual Only','ListenBrainz Only','Clairo','Only Spotify']));
 const stored=await db.prepare('SELECT spotify_artists FROM users WHERE id=?').bind(a.user.id).first();assert.ok(!stored.spotify_artists.includes('private@example'));assert.ok(!stored.spotify_artists.includes('rawHistory'));
 const exposed=(await (await request('/api/members',{member:b})).json()).members.find(m=>m.id===a.user.id);assert.equal(exposed.spotify,undefined);assert.equal(exposed.provider,undefined);assert.ok(exposed.artists.includes('Only Spotify'));
 assert.equal((await (await request('/api/me',{member:b})).json()).user.spotify,null);
 const replaced=(await (await request('/api/music/spotify',{member:a,method:'POST',body:{artists:[{name:'Reimported',plays:3,msPlayed:1}]}})).json()).user;assert.deepEqual(replaced.spotify.artists,[{name:'Reimported',plays:3,msPlayed:1}]);assert.ok(!replaced.artists.includes('Only Spotify'));
 const removed=(await (await request('/api/music/spotify',{member:a,method:'DELETE'})).json()).user;assert.equal(removed.spotify,null);assert.deepEqual(new Set(removed.artists),new Set(['Manual Only','ListenBrainz Only']));assert.equal(removed.provider.username,'some-slug');
 for(const artists of [null,{},Array.from({length:201},()=>({name:'x',plays:1,msPlayed:0})),[null],[{name:'',plays:1,msPlayed:0}],[{name:'x'.repeat(121),plays:1,msPlayed:0}],[{name:'x',plays:0,msPlayed:0}],[{name:'x',plays:1.1,msPlayed:0}],[{name:'x',plays:Number.MAX_SAFE_INTEGER+1,msPlayed:0}],[{name:'x',plays:1,msPlayed:-1}],[{name:'x',plays:1,msPlayed:'2'}]]){
  assert.equal((await request('/api/music/spotify',{member:a,method:'POST',body:{artists}})).status,400);
 }
 assert.equal((await request('/api/music/spotify',{member:a,method:'POST',body:{artists:[],extra:'x'.repeat(130000)}})).status,413);
});

const searchRequest=(instance,member,q)=>instance.fetch(new Request(origin+'/api/artists/search?q='+encodeURIComponent(q),{headers:member?{Cookie:member.cookie}:{}}),env,{});
const artistReply=()=>Response.json({artists:[{id:'12345678-1234-1234-1234-123456789abc',name:'Hidden Artist',score:100,type:'Person'}]});
test('artist search requires membership, validates queries, shares normalized cache, and limits each member',async()=>{
 const a=await login('130'),b=await login('131');let calls=0;const searches=[];
 const instance=createApp({fetcher:async(url,options)=>{calls++;searches.push({url,options});return artistReply();}});
 assert.equal((await searchRequest(instance,null,'Hidden')).status,401);
 for(const q of ['','x','x'.repeat(81),'abc\nxyz'])assert.equal((await searchRequest(instance,a,q)).status,400);
 await db.prepare("DELETE FROM rate_limits WHERE id='artist-provider'").run();
 const first=await searchRequest(instance,a,'Hidden');assert.equal(first.status,200);assert.equal((await first.json()).source,'MusicBrainz / Apple');
 assert.equal((await searchRequest(instance,b,'  HIDDEN  ')).status,200);assert.equal(calls,1);
 assert.ok(searches[0].url.startsWith('https://musicbrainz.org/ws/2/artist/'));assert.ok(!searches[0].url.includes(a.user.id));assert.equal(searches[0].options.headers.Cookie,undefined);
 assert.equal((await db.prepare('SELECT expires_at FROM artist_search_cache WHERE query=?').bind('hidden').first()).expires_at>Date.now()+6*86400000,true);
 for(let n=0;n<89;n++)assert.equal((await searchRequest(instance,a,'Hidden')).status,200);
 assert.equal((await searchRequest(instance,a,'Hidden')).status,429);assert.equal(calls,1);
});
test('artist provider slots are spaced across app instances and reject an excessive queue',async()=>{
 const member=await login('132'),times=[];const fetcher=async()=>{times.push(Date.now());return artistReply();};
 await db.prepare("DELETE FROM rate_limits WHERE id='artist-provider'").run();
 const responses=await Promise.all([searchRequest(createApp({fetcher}),member,'Queue One'),searchRequest(createApp({fetcher}),member,'Queue Two')]);
 assert.ok(responses.every(r=>r.status===200));assert.equal(times.length,2);assert.ok(times[1]-times[0]>=1000);
 const future=Date.now()+10000;await db.prepare("UPDATE rate_limits SET expires_at=? WHERE id='artist-provider'").bind(future).run();
 const busy=await searchRequest(createApp({fetcher}),member,'Queue Three');assert.equal(busy.status,429);assert.equal(busy.headers.get('Retry-After'),'2');assert.equal(times.length,2);
 assert.equal((await db.prepare("SELECT expires_at FROM rate_limits WHERE id='artist-provider'").first()).expires_at,future);
 await db.prepare("DELETE FROM rate_limits WHERE id='artist-provider'").run();
});
test('artist provider failures and timeouts are honest and never stored as successful cache entries',{timeout:15000},async()=>{
 const member=await login('133');
 const failure=createApp({fetcher:async()=>new Response('private upstream body',{status:503,headers:{'Retry-After':'3'}})});
 const response=await searchRequest(failure,member,'Provider Failure');assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'3');assert.ok(!(await response.text()).includes('private upstream'));
 assert.equal(await db.prepare('SELECT query FROM artist_search_cache WHERE query=?').bind('provider failure').first(),null);
 await db.prepare("DELETE FROM rate_limits WHERE id='artist-provider'").run();
 const hanging=createApp({fetcher:()=>new Promise(()=>{})});
 const timedOut=await searchRequest(hanging,member,'Provider Timeout');assert.equal(timedOut.status,504);assert.equal((await timedOut.json()).error.code,'TIMEOUT');
 assert.equal(await db.prepare('SELECT query FROM artist_search_cache WHERE query=?').bind('provider timeout').first(),null);
});

test('Apple fallback shares a global request budget across users and stops before upstream when exhausted',async()=>{
 const member=await login('134');let appleCalls=0;
 const instance=createApp({fetcher:async url=>{
  if(url.startsWith('https://musicbrainz.org/'))return new Response('',{status:503});
  appleCalls++;return Response.json({results:[{wrapperType:'artist',artistType:'Artist',artistId:123,artistName:'Fallback Artist'}]});
 }});
 const bucket=Math.floor(Date.now()/60000),key=`artist-apple-provider:${bucket}`;
 await db.prepare('INSERT INTO rate_limits(id,count,expires_at) VALUES (?,20,?) ON CONFLICT(id) DO UPDATE SET count=20,expires_at=excluded.expires_at').bind(key,Date.now()+120000).run();
 await db.prepare("DELETE FROM rate_limits WHERE id='artist-provider'").run();
 const denied=await searchRequest(instance,member,'Fallback Budget');assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('Retry-After'))>=1);assert.equal(appleCalls,0);
 assert.equal(await db.prepare('SELECT query FROM artist_search_cache WHERE query=?').bind('fallback budget').first(),null);
 await db.prepare('DELETE FROM rate_limits WHERE id=?').bind(key).run();
});
