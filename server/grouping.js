import {normalizeArtist} from '../web/artists.js';
const names=values=>[...new Map((values||[]).filter(v=>typeof v==='string').map(v=>[normalizeArtist(v),v.normalize('NFKC').trim().replace(/\s+/g,' ')])).entries()].filter(([key])=>key);
export function tasteModel(members,blocks=[]){
 const profiles=new Map(members.map(m=>[m.id,{artists:new Map(names(m.artists)),genres:new Map(names(m.genres))}]));
 const n=members.length,index=new Map(members.map((m,i)=>[m.id,i])),artists=new Float64Array(n*n),genres=new Float64Array(n*n);
 for(const [field,matrix] of [['artists',artists],['genres',genres]]){
  const listeners=new Map();for(let i=0;i<n;i++)for(const key of profiles.get(members[i].id)[field].keys()){if(!listeners.has(key))listeners.set(key,[]);listeners.get(key).push(i);}
  for(const ids of listeners.values()){const weight=field==='artists'?3*(1+Math.log((n+1)/(ids.length+1))):1;for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){matrix[ids[i]*n+ids[j]]+=weight;matrix[ids[j]*n+ids[i]]+=weight;}}
 }
 const forbidden=new Set();for(const [a,b] of blocks){if(index.has(a)&&index.has(b)){forbidden.add(index.get(a)*n+index.get(b));forbidden.add(index.get(b)*n+index.get(a));}}
 const valid=g=>{if(!forbidden.size)return true;for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++)if(forbidden.has(index.get(g[i])*n+index.get(g[j])))return false;return true;};
 const score=g=>{let a=0,b=0,count=0;const ids=g.map(id=>index.get(id));for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const at=ids[i]*n+ids[j];a+=artists[at];b+=genres[at];count++;}return [a/(count||1),b/(count||1)];};
 const gain=(group,candidate)=>{let a=0,b=0;const c=index.get(candidate);for(const id of group){const at=index.get(id)*n+c;a+=artists[at];b+=genres[at];}return [a,b];};
 return {profiles,valid,score,gain};
}
const better=(a,b)=>a[0]>b[0]+1e-9||(Math.abs(a[0]-b[0])<1e-9&&a[1]>b[1]);
export function groupSizes(n,size){
 if(n<2)return [];
 const count=Math.max(1,Math.min(Math.floor(n/2),size===2?Math.floor(n/2):Math.ceil(n/size)));
 return Array.from({length:count},(_,i)=>Math.floor(n/count)+(i<n%count?1:0));
}
export function buildGroups(members,size=2,blocks=[]){
 if(!Number.isSafeInteger(size)||size<2)throw new Error('Choose a whole group size of at least two.');
 const ids=members.map(m=>m.id).sort(),model=tasteModel(members,blocks),sizes=groupSizes(ids.length,size);
 if(sizes.length===1&&model.valid(ids))return {groups:[ids],unassigned:[]};
 let best=null;
 // Fixed candidate/evaluation budgets keep larger events bounded without capping attendance.
 const starts=Math.max(1,Math.min(4,Math.floor(5000/Math.max(1,ids.length**2))));
 for(let start=0;start<starts;start++){
  const remaining=new Set(ids),groups=[];
  for(const capacity of sizes){
   const seed=[...remaining][start%remaining.size];if(seed===undefined)break;const group=[seed];remaining.delete(seed);
   while(group.length<capacity&&remaining.size){let pick=null,top=[-1,-1];
    for(const candidate of remaining){if(!model.valid([...group,candidate]))continue;const s=model.gain(group,candidate);if(better(s,top)){top=s;pick=candidate;}}
    if(pick===null)break;group.push(pick);remaining.delete(pick);
   }
   if(group.length>1)groups.push(group);else remaining.add(seed);
  }
  // Repair leftover attendance where hard constraints permit, even if preferred size must yield.
  for(const member of [...remaining]){let target=null,top=[-1,-1];for(const group of groups){if(!model.valid([...group,member]))continue;const s=model.score([...group,member]);if(better(s,top)){target=group;top=s;}}if(target){target.push(member);remaining.delete(member);}}
  const rest=[...remaining];for(let i=0;i<rest.length;i++){if(!remaining.has(rest[i]))continue;const partner=rest.slice(i+1).find(b=>remaining.has(b)&&model.valid([rest[i],b]));if(partner){groups.push([rest[i],partner]);remaining.delete(rest[i]);remaining.delete(partner);}}
  // Improve strong matches with bounded member swaps while preserving group sizes.
  let budget=Math.max(1,Math.floor(1200/Math.max(1,(Math.max(...sizes)/3)**2)));
  for(let pass=0;pass<3&&budget>0;pass++)for(let i=0;i<groups.length&&budget>0;i++)for(let j=i+1;j<groups.length&&budget>0;j++){
   for(let a=0;a<groups[i].length&&budget>0;a++)for(let b=0;b<groups[j].length&&budget-->0;b++){
    const x=[...groups[i]],y=[...groups[j]];[x[a],y[b]]=[y[b],x[a]];if(!model.valid(x)||!model.valid(y))continue;
    const old=[model.score(groups[i]),model.score(groups[j])],next=[model.score(x),model.score(y)];
    if(better([next[0][0]+next[1][0],next[0][1]+next[1][1]],[old[0][0]+old[1][0],old[0][1]+old[1][1]])){groups[i]=x;groups[j]=y;}
   }
  }
  const total=groups.reduce((s,g)=>{const v=model.score(g);return [s[0]+v[0],s[1]+v[1]];},[0,0]);
  if(!best||remaining.size<best.unassigned.length||(remaining.size===best.unassigned.length&&better(total,best.score)))best={groups,unassigned:[...remaining],score:total};
 }
 return {groups:best?.groups||[],unassigned:best?.unassigned||ids};
}
export function explainGroup(ids,members){
 const available=members.filter(m=>ids.includes(m.id)),overlaps=field=>{const map=new Map();for(const m of available)for(const [key,label] of names(m[field])){if(!map.has(key))map.set(key,{name:label,memberIds:[]});map.get(key).memberIds.push(m.id);}return [...map.values()].filter(v=>v.memberIds.length>1).sort((a,b)=>b.memberIds.length-a.memberIds.length||a.name.localeCompare(b.name));};
 const artists=overlaps('artists'),genres=overlaps('genres'),warnings=[];
 if(!artists.length)warnings.push(genres.length?'Genre-only match':'No shared taste');
 else if(available.some(m=>!artists.some(a=>a.memberIds.includes(m.id))))warnings.push('A member has no shared artist with this group');
 return {artists,genres:artists.length?[]:genres,warnings};
}
