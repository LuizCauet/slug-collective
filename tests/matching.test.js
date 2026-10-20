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
