import {normalizeArtist} from './artists.js';
export function sharedAlbums(member,profile){return member.albums.filter(id=>(profile.favorites||[]).includes(id));}
export function rankMembers(members,profile,mode='people'){
 const wanted={Vocals:['Production','Guitar','Keys'],Production:['Vocals','Songwriting','Film'],Guitar:['Drums','Bass','Vocals'],Photography:['Design','Film'],Design:['Photography','Production'],Film:['Production','Songwriting'],Drums:['Bass','Guitar'],Bass:['Drums','Guitar'],Writing:['Design','Songwriting'],Songwriting:['Vocals','Production'],Keys:['Vocals','Production'],DJ:['Production','Film'],Illustration:['Design','Writing']};
 const selected=new Set((profile.artists||[]).map(normalizeArtist));
 const counts=new Map();for(const m of members)for(const a of new Set((m.artists||[]).map(normalizeArtist)))counts.set(a,(counts.get(a)||0)+1);
 return members.map(m=>{const shared=sharedAlbums(m,profile);const sharedArtists=(m.artists||[]).filter(a=>selected.has(normalizeArtist(a))).sort((a,b)=>counts.get(normalizeArtist(a))-counts.get(normalizeArtist(b)));const tasteScore=sharedArtists.reduce((sum,a)=>sum+1+Math.log((members.length+1)/(counts.get(normalizeArtist(a))+1)),0);const pairs=profile.roles.flatMap(p=>m.roles.filter(r=>(wanted[p]||[]).includes(r)).map(r=>({yours:p,theirs:r})));const complements=[...new Set(pairs.map(p=>p.theirs))];return {...m,shared,sharedArtists,complements,pairs,score:(selected.size?tasteScore*3:shared.length*3)+(mode==='create'?complements.length*5:0)};}).sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id)));
}
