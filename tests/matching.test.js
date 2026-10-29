import {test} from 'node:test';
import assert from 'node:assert/strict';
import {members} from '../web/data.js';
import {rankMembers} from '../web/matching.js';
test('shared listening is prioritized over no overlap',()=>{
 const result=rankMembers(members,{favorites:[0,4,5],roles:[]});
 assert.equal(result[0].name,'Maya Chen');
 assert.equal(result[0].shared.length,3);
 assert.ok(result[0].score>result.at(-1).score);
});
test('creative roles change recommendations without changing listening matches',()=>{
 const p={favorites:[],roles:['Production']};
 const people=rankMembers(members,p);
 const creators=rankMembers(members,p,'create');
 assert.equal(people[0].name,'Maya Chen');
 assert.ok(creators[0].complements.length>0);
 assert.ok(creators[0].roles.some(r=>['Vocals','Songwriting','Film'].includes(r)));
});
test('empty profile remains browsable and ranking is stable',()=>{
 const result=rankMembers(members,{favorites:[],roles:[]});
 assert.equal(result.length,12);
 assert.deepEqual(result.map(m=>m.id),members.map(m=>m.id).sort((a,b)=>String(a).localeCompare(String(b))));
});

test('equal scores sort real string member IDs consistently regardless of input order',()=>{
 const sample=[{id:'f8a1-uuid',artists:[],albums:[],roles:[]},{id:'1ab2-uuid',artists:[],albums:[],roles:[]},{id:'a7c3-uuid',artists:[],albums:[],roles:[]}];
 const profile={artists:[],favorites:[],roles:[]};
 const expected=['1ab2-uuid','a7c3-uuid','f8a1-uuid'];
 assert.deepEqual(rankMembers(sample,profile).map(m=>m.id),expected);
 assert.deepEqual(rankMembers([...sample].reverse(),profile).map(m=>m.id),expected);
});
test('shared artists with fewer listeners in the community carry more weight',()=>{
 const sample=[{id:0,artists:['Common'],albums:[],roles:[]},{id:1,artists:['Deep cut'],albums:[],roles:[]},{id:2,artists:['Common'],albums:[],roles:[]}];
 const result=rankMembers(sample,{favorites:[],artists:['Common','Deep cut'],roles:[]});
 assert.equal(result[0].id,1);
 assert.deepEqual(result[0].sharedArtists,['Deep cut']);
});
test('artist matching normalizes case and whitespace and never invents overlap',()=>{
 const profile={favorites:[],artists:['  FEEBLE   LITTLE HORSE  '],roles:[]};
 const result=rankMembers(members,profile);
 assert.equal(result.filter(m=>m.sharedArtists.length).length,2);
 assert.ok(result[0].sharedArtists.includes('feeble little horse'));
 assert.ok(rankMembers(members,{...profile,artists:['An artist not in the demo']}).every(m=>m.sharedArtists.length===0));
});

test('genre-only overlap ranks above no overlap and contributes one point per shared genre',()=>{
 const sample=[{id:'none',artists:['Other'],genres:['Techno']},{id:'genre',genres:['Shoegaze']}];
 const result=rankMembers(sample,{artists:['Personal artist'],genres:['shoegaze']});
 assert.equal(result[0].id,'genre');assert.deepEqual(result[0].sharedGenres,['Shoegaze']);assert.equal(result[0].genreOverlapCount,1);assert.equal(result[0].artistOverlapCount,0);assert.equal(result[0].tasteScore,1);assert.equal(result[1].score,0);
});
test('combined artist and genre overlap beats the same artist overlap alone',()=>{
 const result=rankMembers([{id:'artist',artists:['Deep Cut']},{id:'both',artists:['Deep Cut'],genres:['Ambient']},{id:'none'}],{artists:['Deep Cut'],genres:['Ambient']});
 assert.deepEqual(result.map(m=>m.id),['both','artist','none']);assert.equal(result[0].score-result[1].score,1);assert.equal(result[0].artistOverlapCount,1);assert.equal(result[0].genreOverlapCount,1);assert.equal(result[0].tasteScore,result[0].score);
});
test('normalized duplicate artists and genres never inflate overlap counts, rarity, or scores',()=>{
 const plain={id:'member',artists:['Deep Cut'],genres:['Dream pop']};
 const duplicated={...plain,artists:['  Deep   Cut ','DEEP CUT','Ｄｅｅｐ Ｃｕｔ'],genres:[' Dream   pop ','DREAM POP','Ｄｒｅａｍ ｐｏｐ']};
 const profile={artists:['deep cut','DEEP CUT'],genres:['dream pop','ＤＲＥＡＭ ＰＯＰ']};
 const base=rankMembers([plain],profile)[0],result=rankMembers([duplicated],profile)[0];
 assert.equal(result.artistOverlapCount,1);assert.equal(result.genreOverlapCount,1);assert.equal(result.tasteScore,base.tasteScore);assert.equal(result.score,4);assert.deepEqual(result.sharedArtists,['Deep Cut']);assert.deepEqual(result.sharedGenres,['Dream pop']);
});
test('missing artist, genre, album, and role arrays remain safe with stable equal-score ordering',()=>{
 const result=rankMembers([{id:'b'},{id:'a',genres:null,artists:null,roles:null,albums:null}],{});
 assert.deepEqual(result.map(m=>m.id),['a','b']);assert.ok(result.every(m=>m.score===0&&m.artistOverlapCount===0&&m.genreOverlapCount===0));
 assert.deepEqual(rankMembers(undefined),[]);
});
test('Create retains its five-point complementary-role bonus on top of combined taste',()=>{
 const member={id:'creator',artists:['Deep Cut'],genres:['Ambient'],roles:['Vocals']};
 const profile={artists:['Deep Cut'],genres:['Ambient'],roles:['Production']};
 const person=rankMembers([member],profile)[0],creator=rankMembers([member],profile,'create')[0];
 assert.equal(creator.tasteScore,person.tasteScore);assert.equal(creator.score-person.score,5);assert.equal(creator.artistOverlapCount,1);assert.equal(creator.genreOverlapCount,1);assert.deepEqual(creator.complements,['Vocals']);
});
