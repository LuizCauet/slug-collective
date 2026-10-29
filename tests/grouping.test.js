import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {buildGroups,groupSizes,explainGroup,tasteModel} from '../server/grouping.js';
const member=(id,artists=[],genres=[])=>({id:String(id),artists,genres});
test('configured sizes cover every roster without singletons, including beyond 50',()=>{
 for(const n of [...Array.from({length:49},(_,i)=>i+2),51,100,200])for(const size of [2,3,4,5,10,500]){
  const sizes=groupSizes(n,size);assert.equal(sizes.reduce((a,b)=>a+b,0),n);assert.ok(sizes.every(s=>s>=2));assert.ok(Math.max(...sizes)-Math.min(...sizes)<=1);
 }
 for(const n of [0,1])assert.equal(buildGroups(Array.from({length:n},(_,i)=>member(i)),2).groups.length,0);
 assert.deepEqual(groupSizes(7,2),[3,2,2]);assert.deepEqual(groupSizes(4,3),[2,2]);
 for(const size of [2,3,4,5,80]){const people=Array.from({length:51},(_,i)=>member(i,['Artist '+i%6]));const result=buildGroups(people,size);assert.equal(result.unassigned.length,0);assert.equal(new Set(result.groups.flat()).size,51);assert.ok(result.groups.every(g=>g.length>=2));assert.deepEqual(result,buildGroups(people,size));}
});
test('strong niche matches survive and genre fallback breaks artist ties',()=>{
 const people=[member('a',['Rare']),member('b',['Rare']),member('c',[],['Ambient']),member('d',[],['Ambient'])];
 const result=buildGroups(people,2);assert.ok(result.groups.some(g=>g.includes('a')&&g.includes('b')));assert.ok(result.groups.some(g=>g.includes('c')&&g.includes('d')));
 const model=tasteModel([member('a',[' RARE  ','rare']),member('b',['rare'])]);assert.equal(model.score(['a','b'])[0],3);
});
test('blocks prevent pairing and expose infeasible remainder without violating constraints',()=>{
 const people=[member('a',['X']),member('b',['X']),member('c',['Y']),member('d',['Y'])],blocks=[['a','b']];
 const result=buildGroups(people,2,blocks);assert.equal(result.unassigned.length,0);assert.ok(result.groups.every(g=>!(g.includes('a')&&g.includes('b'))));
 const impossible=buildGroups(people.slice(0,2),2,blocks);assert.equal(impossible.groups.length,0);assert.equal(impossible.unassigned.length,2);
});
test('partial overlap names only members who share it and warns about disconnected partners',()=>{
 const people=[member('a',['X']),member('b',['X']),member('c',['Y'])];const e=explainGroup(['a','b','c'],people);assert.deepEqual(e.artists[0].memberIds,['a','b']);assert.equal(e.warnings.length,1);
 const fallback=explainGroup(['a','b'],[member('a',[],[' Ambient ']),member('b',[],['ambient'])]);assert.equal(fallback.genres.length,1);assert.deepEqual(fallback.warnings,['Genre-only match']);
});
test('bounded matching benchmarks 50, 100 and 200 member rosters',()=>{
 for(const n of [50,100,200]){const people=Array.from({length:n},(_,i)=>member(i,Array.from({length:20},(_,j)=>'Artist '+(i+j)%70)));const start=performance.now(),result=buildGroups(people,4),elapsed=performance.now()-start;assert.equal(result.groups.flat().length,n);assert.ok(elapsed<3000,`${n}: ${elapsed} ms`);console.log(`Grouping benchmark: ${n} attendees, ${elapsed.toFixed(1)} ms`);}
});

test('small fixture matches the exhaustive best pair partition',()=>{
 const people=[member('a',['A','B']),member('b',['A','B']),member('c',['C']),member('d',['C']),member('e',['D']),member('f',['D'])],model=tasteModel(people);
 function partitions(ids){if(!ids.length)return [[]];const [first,...rest]=ids;return rest.flatMap((other,i)=>partitions(rest.filter((_,j)=>i!==j)).map(groups=>[[first,other],...groups]));}
 const total=groups=>groups.reduce((sum,g)=>sum+model.score(g)[0],0),best=Math.max(...partitions(people.map(m=>m.id)).map(total));assert.equal(total(buildGroups(people,2).groups),best);
});
