export function sharedAlbums(member,profile){return member.albums.filter(id=>profile.favorites.includes(id));}
export function rankMembers(members,profile,mode='people'){
 const wanted={Vocals:['Production','Guitar','Keys'],Production:['Vocals','Songwriting','Film'],Guitar:['Drums','Bass','Vocals'],Photography:['Design','Film'],Design:['Photography','Production'],Film:['Production','Songwriting'],Drums:['Bass','Guitar'],Bass:['Drums','Guitar'],Writing:['Design','Songwriting'],Songwriting:['Vocals','Production'],Keys:['Vocals','Production'],DJ:['Production','Film'],Illustration:['Design','Writing']};
 return members.map(m=>{const shared=sharedAlbums(m,profile);const pairs=profile.roles.flatMap(p=>m.roles.filter(r=>(wanted[p]||[]).includes(r)).map(r=>({yours:p,theirs:r})));const complements=[...new Set(pairs.map(p=>p.theirs))];return {...m,shared,complements,pairs,score:shared.length*3+(mode==='create'?complements.length*5:0)};}).sort((a,b)=>b.score-a.score||a.id-b.id);
}
