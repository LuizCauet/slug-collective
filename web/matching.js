import {normalizeArtist} from './artists.js';

function uniqueNames(values){
 const names=new Map();
 for(const value of Array.isArray(values)?values:[]){
  if(typeof value!=='string')continue;
  const name=value.normalize('NFKC').trim().replace(/\s+/g,' '),key=normalizeArtist(name);
  if(key&&!names.has(key))names.set(key,{name,key});
 }
 return [...names.values()];
}
const list=value=>Array.isArray(value)?value:[];
export function sharedAlbums(member={},profile={}){
 const favorites=new Set(list(profile.favorites));
 return [...new Set(list(member.albums))].filter(id=>favorites.has(id));
}
export function rankMembers(members=[],profile={},mode='people'){
 members=list(members);profile=profile||{};
 const wanted={Vocals:['Production','Guitar','Keys'],Production:['Vocals','Songwriting','Film'],Guitar:['Drums','Bass','Vocals'],Photography:['Design','Film'],Design:['Photography','Production'],Film:['Production','Songwriting'],Drums:['Bass','Guitar'],Bass:['Drums','Guitar'],Writing:['Design','Songwriting'],Songwriting:['Vocals','Production'],Keys:['Vocals','Production'],DJ:['Production','Film'],Illustration:['Design','Writing']};
 const selectedArtists=new Set(uniqueNames(profile.artists).map(a=>a.key));
 const selectedGenres=new Set(uniqueNames(profile.genres).map(g=>g.key));
 const counts=new Map();
 for(const member of members)for(const artist of uniqueNames(member.artists))counts.set(artist.key,(counts.get(artist.key)||0)+1);
 return members.map(member=>{
  const shared=sharedAlbums(member,profile);
  const sharedArtists=uniqueNames(member.artists).filter(a=>selectedArtists.has(a.key)).sort((a,b)=>counts.get(a.key)-counts.get(b.key)).map(a=>a.name);
  const sharedGenres=uniqueNames(member.genres).filter(g=>selectedGenres.has(g.key)).map(g=>g.name);
  const artistTaste=sharedArtists.reduce((sum,name)=>sum+1+Math.log((members.length+1)/(counts.get(normalizeArtist(name))+1)),0);
  // Genres are broad, so each contributes one point; artist overlap retains its rarity weight and multiplier.
  const tasteScore=(selectedArtists.size?artistTaste*3:shared.length*3)+sharedGenres.length;
  const pairs=[...new Set(list(profile.roles))].flatMap(role=>[...new Set(list(member.roles))].filter(other=>(wanted[role]||[]).includes(other)).map(other=>({yours:role,theirs:other})));
  const complements=[...new Set(pairs.map(pair=>pair.theirs))];
  return {...member,shared,sharedArtists,sharedGenres,artistOverlapCount:sharedArtists.length,genreOverlapCount:sharedGenres.length,tasteScore,complements,pairs,score:tasteScore+(mode==='create'?complements.length*5:0)};
 }).sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id)));
}
