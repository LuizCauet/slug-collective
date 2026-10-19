// Fictional member posts used to demonstrate an evolving listening feed.
export const rotationPosts=[
 {id:'sample-maya',memberId:0,artist:'feeble little horse',note:'Need someone to explain how they got the guitars to sound like this.'},
 {id:'sample-jordan',memberId:1,artist:'Dijon',note:'Been trying to learn this sound on guitar all week.'},
 {id:'sample-sofia',memberId:2,artist:'Liv.e',note:'Headphones on the bus home. This one stayed with me.'},
 {id:'sample-kai',memberId:3,artist:'454',note:'Putting this in the next set.'},
 {id:'sample-zoe',memberId:9,artist:'Grouper',note:'For the walk back through the trees.'},
 {id:'sample-jules',memberId:11,artist:'Wednesday',note:'Anyone else have this on repeat?'}
];
export function rotationFeed(posts,ownPost,query=''){
 const list=ownPost?[{...ownPost,id:'own',memberId:null},...posts]:[...posts];
 const q=query.trim().toLocaleLowerCase();
 return list.filter(p=>[p.artist,p.title||'',p.note,p.author||''].join(' ').toLocaleLowerCase().includes(q));
}
