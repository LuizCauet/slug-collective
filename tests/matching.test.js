import {test} from 'node:test';
import assert from 'node:assert/strict';
import {members} from '../dist/data.js';
import {rankMembers} from '../dist/matching.js';
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
 assert.deepEqual(result.map(m=>m.id),members.map(m=>m.id));
});
