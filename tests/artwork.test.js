import {test} from 'node:test';
import assert from 'node:assert/strict';
import {musicArt} from '../dist/music-art.js';
import {existsSync} from 'node:fs';
test('all music-art records have a bundled file and a source link',()=>{
 for(const entry of Object.values(musicArt)){
  assert.ok(existsSync(new URL('../dist/'+entry.art,import.meta.url)),entry.art);
  assert.ok(entry.url.startsWith('https://'));
 }
});
