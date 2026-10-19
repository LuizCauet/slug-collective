import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rotationFeed,rotationPosts} from '../dist/rotation.js';
import {musicArt} from '../dist/music-art.js';
import {existsSync} from 'node:fs';
test('a local listening post appears first without modifying sample posts',()=>{
 const own={artist:'Duster',title:'Stratosphere',note:'Bus ride home'};
 const result=rotationFeed(rotationPosts,own);
 assert.equal(result[0].id,'own');
 assert.equal(result.length,rotationPosts.length+1);
 assert.equal(rotationPosts.length,6);
});
test('posts filter by artist, record, note and author',()=>{
 const own={artist:'Duster',title:'Stratosphere',note:'Bus ride home',author:'Luiz'};
 for(const query of ['DUSTER','stratosphere','bus ride','luiz'])assert.equal(rotationFeed([],own,query).length,1);
 assert.equal(rotationFeed([],own,'unknown').length,0);
});
test('all music-art records have a bundled file and a source link',()=>{
 for(const entry of Object.values(musicArt)){
  assert.ok(existsSync(new URL('../dist/'+entry.art,import.meta.url)),entry.art);
  assert.ok(entry.url.startsWith('https://'));
 }
});
