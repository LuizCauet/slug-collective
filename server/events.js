import {buildGroups,explainGroup,tasteModel} from './grouping.js';
export async function eventRoute(req,env,u,{json,fail,readBody,isAdmin,userView}){
 const path=new URL(req.url).pathname,method=req.method,db=env.DB,admin=isAdmin(u,env);
 const get=(sql,...args)=>db.prepare(sql).bind(...args).first();
 const all=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
 const run=(sql,...args)=>db.prepare(sql).bind(...args).run();
 const parse=s=>s?JSON.parse(s):null;
 const clean=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||v.includes('\0')||(required&&!v.trim()))fail(400,'INVALID_EVENT','Check the event title and instructions.');return v.trim();};
 const size=v=>{if(!Number.isSafeInteger(v)||v<2)fail(400,'INVALID_SIZE','Choose a whole group size of at least two.');return v;};
 if(path==='/api/events'){
  if(method==='GET')return json({events:await all(`SELECT e.id,e.title,e.phase,e.joining_open,e.preferred_size,e.created_at FROM events e WHERE ? OR EXISTS (SELECT 1 FROM event_attendees a WHERE a.event_id=e.id AND a.user_id=? AND a.status='active') ORDER BY e.created_at DESC`,admin?1:0,u.id)});
  if(method==='POST'){
   if(!admin)fail(403,'FORBIDDEN','Admin access required.');const b=await readBody(req),id=crypto.randomUUID();
   await run('INSERT INTO events(id,creator_id,title,instructions,preferred_size,created_at) VALUES (?,?,?,?,?,?)',id,u.id,clean(b.title,100,true),clean(b.instructions||'',1000),size(b.preferredSize??2),Date.now());return json({id},201);
  }
  fail(405,'METHOD_NOT_ALLOWED','Method not allowed.');
 }
 const match=path.match(/^\/api\/events\/([a-zA-Z0-9-]+)(?:\/(join|leave|sort|draft|publish|end|remove))?$/);if(!match)fail(404,'NOT_FOUND','Event not found.');
 const [,eid,action]=match;let event=await get('SELECT * FROM events WHERE id=?',eid);if(!event)fail(404,'NOT_FOUND','Event not found.');
 const attendance=await get('SELECT status FROM event_attendees WHERE event_id=? AND user_id=?',eid,u.id);
 const roster=async()=>{const rows=await all("SELECT u.* FROM users u JOIN event_attendees a ON a.user_id=u.id WHERE a.event_id=? AND a.status='active' ORDER BY a.joined_at,u.id",eid);return rows.map(r=>userView(r,env));};
 const blocks=async()=>{const rows=await all("SELECT b.blocker_id,b.blocked_id FROM blocks b JOIN event_attendees a ON a.user_id=b.blocker_id AND a.event_id=? AND a.status='active' JOIN event_attendees c ON c.user_id=b.blocked_id AND c.event_id=a.event_id AND c.status='active'",eid);return rows.map(r=>[r.blocker_id,r.blocked_id]);};
 const viewGroups=async(data,privateView)=>{
  if(!data)return null;
  const rows=await all("SELECT u.id,u.name,u.avatar,t.artists,t.genres FROM event_tastes t JOIN users u ON u.id=t.user_id JOIN event_attendees a ON a.user_id=u.id AND a.event_id=t.event_id WHERE t.event_id=? AND t.revision=? AND a.status='active'",eid,data.tasteRevision);
  const members=rows.map(r=>({...r,artists:parse(r.artists),genres:parse(r.genres)})),active=new Set(members.map(m=>m.id));
  return {groups:data.groups.map((ids,i)=>{const present=ids.filter(id=>active.has(id)),explanation=explainGroup(present,members);if(!privateView)delete explanation.warnings;return {number:i+1,members:present.map(id=>{const m=members.find(m=>m.id===id);return {id:m.id,name:m.name,avatar:m.avatar};}),...explanation};}).filter(g=>g.members.length),unassigned:data.unassigned.filter(id=>active.has(id))};
 };
 if(method==='GET'&&!action){
  const active=attendance?.status==='active',count=await get("SELECT COUNT(*) AS n FROM event_attendees WHERE event_id=? AND status='active'",eid);
  const result={id:event.id,title:event.title,instructions:event.instructions,preferredSize:event.preferred_size,phase:event.phase,joiningOpen:!!event.joining_open,count:count.n,joined:active,removed:attendance?.status==='removed',version:event.version,publishedRevision:event.published_revision};
  if(admin||active)result.published=await viewGroups(parse(event.published),false);
  if(admin)Object.assign(result,{roster:await roster(),draft:await viewGroups(parse(event.draft),true),draftStale:event.draft_roster!==event.roster_revision,draftData:parse(event.draft)});
  return json({event:result});
 }
 if(!['POST','PUT'].includes(method))fail(405,'METHOD_NOT_ALLOWED','Method not allowed.');
 if(event.phase==='ended'&&action==='end'&&admin)return json({ok:true});
 if(event.phase==='ended')fail(409,'EVENT_ENDED','This event has ended.');
 if(action==='join'){
  if(u.onboarding_completed_at==null)fail(403,'ONBOARDING_REQUIRED','Finish choosing your artists before joining.');
  if(attendance?.status==='removed')fail(403,'REMOVED','The host removed you from this event.');
  if(attendance?.status==='active')return json({ok:true});
  const result=await run("INSERT INTO event_attendees(event_id,user_id,status,joined_at) SELECT id,?,'active',? FROM events WHERE id=? AND joining_open=1 AND phase<>'ended' ON CONFLICT(event_id,user_id) DO UPDATE SET status='active',joined_at=excluded.joined_at WHERE event_attendees.status='left'",u.id,Date.now(),eid);
  if(!result.meta.changes){const current=await get('SELECT status FROM event_attendees WHERE event_id=? AND user_id=?',eid,u.id);if(current?.status!=='active')fail(409,'JOINING_CLOSED','Joining is closed.');}return json({ok:true});
 }
 if(action==='leave'){
  await run("UPDATE event_attendees SET status='left' WHERE event_id=? AND user_id=? AND status='active' AND EXISTS (SELECT 1 FROM events WHERE id=? AND phase<>'ended')",eid,u.id,eid);return json({ok:true});
 }
 if(!admin)fail(403,'FORBIDDEN','Admin access required.');
 const b=await readBody(req);if(b.version!==event.version)fail(409,'STALE_EVENT','The event changed. Refresh and review it again.');
 const update=async(set,args=[])=>{const r=await run(`UPDATE events SET ${set},version=version+1 WHERE id=? AND version=? AND phase<>'ended'`,...args,eid,event.version);if(!r.meta.changes)fail(409,'STALE_EVENT','The event changed. Refresh and review it again.');};
 if(!action){
  if(method!=='PUT')fail(405,'METHOD_NOT_ALLOWED','Method not allowed.');
  if(b.joiningOpen!==undefined&&typeof b.joiningOpen!=='boolean')fail(400,'INVALID_EVENT','Check joining status.');
  const next=size(b.preferredSize??event.preferred_size);await update('preferred_size=?,joining_open=?,draft=CASE WHEN preferred_size<>? THEN NULL ELSE draft END',[next,b.joiningOpen===undefined?event.joining_open:Number(b.joiningOpen),next]);return json({ok:true});
 }
 if(action==='remove'){
  if(typeof b.memberId!=='string')fail(400,'INVALID_MEMBER','Choose a member.');
  const r=await run("UPDATE event_attendees SET status='removed' WHERE event_id=? AND user_id=? AND EXISTS (SELECT 1 FROM events WHERE id=? AND version=? AND phase<>'ended')",eid,b.memberId,eid,event.version);if(!r.meta.changes)fail(409,'STALE_EVENT','Refresh the roster and try again.');return json({ok:true});
 }
 if(action==='end'){await update("phase='ended',joining_open=0,ended_at=?",[Date.now()]);return json({ok:true});}
 const members=await roster(),blocked=await blocks();
 if(action==='sort'||action==='draft'){
  if(action==='sort'&&event.phase!=='lobby')fail(409,'GROUPS_PUBLISHED','Published groups stay stable. Move members manually.');
  let data;
  if(action==='sort')data=buildGroups(members,event.preferred_size,blocked);
  else {
   if(!Array.isArray(b.groups)||b.groups.some(g=>!Array.isArray(g)||g.some(id=>typeof id!=='string')))fail(400,'INVALID_GROUPS','Check group assignments.');
   const ids=b.groups.flat(),active=new Set(members.map(m=>m.id));if(new Set(ids).size!==ids.length||ids.some(id=>!active.has(id)))fail(400,'INVALID_GROUPS','A member is missing or assigned twice.');
   const model=tasteModel(members,blocked);if(b.groups.some(g=>!model.valid(g)))fail(400,'PLACEMENT_CONSTRAINT','These assignments conflict with member placement restrictions.');
   data={groups:b.groups.filter(g=>g.length),unassigned:members.filter(m=>!ids.includes(m.id)).map(m=>m.id)};
  }
  data.tasteRevision=crypto.randomUUID();data.scoringVersion=1;
  const statements=members.map(m=>db.prepare("INSERT INTO event_tastes(event_id,user_id,revision,artists,genres) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND version=? AND phase<>'ended')").bind(eid,m.id,data.tasteRevision,JSON.stringify(m.artists),JSON.stringify(m.genres),eid,event.version));
  statements.push(db.prepare("UPDATE events SET draft=?,draft_roster=roster_revision,version=version+1 WHERE id=? AND version=? AND phase<>'ended'").bind(JSON.stringify(data),eid,event.version));
  const results=await db.batch(statements);if(!results.at(-1).meta.changes)fail(409,'STALE_EVENT','The roster changed. Refresh and sort again.');
  await run("DELETE FROM event_tastes WHERE event_id=? AND revision NOT IN (SELECT COALESCE(json_extract(draft,'$.tasteRevision'),'' ) FROM events WHERE id=?) AND revision NOT IN (SELECT COALESCE(json_extract(published,'$.tasteRevision'),'') FROM events WHERE id=?)",eid,eid,eid);return json({ok:true});
 }
 if(action==='publish'){
  const data=parse(event.draft),active=new Set(members.map(m=>m.id));
  if(!data||event.draft_roster!==event.roster_revision)fail(409,'STALE_DRAFT','Review a fresh draft before publishing.');
  if(!data.groups.length||data.groups.some(g=>g.length<2)||new Set(data.groups.flat()).size!==data.groups.flat().length||data.groups.flat().some(id=>!active.has(id)))fail(400,'INVALID_GROUPS','Each published group needs at least two active members.');
  const publishModel=tasteModel(members,blocked);
  if(data.groups.some(g=>!publishModel.valid(g)))fail(409,'PLACEMENT_CONSTRAINT','Placement restrictions changed. Review the draft.');
  const result=await run("UPDATE events SET published=draft,published_revision=published_revision+1,phase='published',draft=NULL,draft_roster=NULL,version=version+1 WHERE id=? AND version=? AND phase<>'ended' AND draft_roster=roster_revision AND NOT EXISTS(SELECT 1 FROM json_each(events.draft,'$.groups') g JOIN json_each(g.value) a JOIN json_each(g.value) c JOIN blocks b ON b.blocker_id=a.value AND b.blocked_id=c.value)",eid,event.version);if(!result.meta.changes)fail(409,'STALE_EVENT','Attendance or placement restrictions changed. Review the draft.');return json({ok:true});
 }
 fail(404,'NOT_FOUND','Event action not found.');
}
