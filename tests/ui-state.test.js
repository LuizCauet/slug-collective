import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../web/app.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/^boot\(\);$/m,'');
function harness(width=390,storage=new Map()){
 const node={addEventListener(){},classList:{toggle(){}},innerHTML:''};
 const state={poll:null,calls:[],result:{threads:[]},renders:0,timers:[],artistHandler:null};
 const context=vm.createContext({localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},document:{hidden:false,querySelector:selector=>selector==='#profile-form'?null:node,addEventListener(){}},window:{innerWidth:width,addEventListener(){},scrollTo(){}},location:{search:''},URL,URLSearchParams,structuredClone,crypto:globalThis.crypto,AbortController,artistCatalog:['Tirzah','Dean Blunt','Clairo'],normalizeArtist:s=>String(s).normalize('NFKC').trim().toLowerCase(),setTimeout:(fn,delay)=>(state.timers.push({fn,delay}),state.timers.length),clearTimeout(){},setInterval:fn=>(state.poll=fn,1),clearInterval(){},api:async path=>{state.calls.push(path);if(path.startsWith('/api/artists/'))return state.artistHandler?state.artistHandler(path):{artists:[]};return path==='/api/threads'?state.result:{messages:[]};}});
 vm.runInContext(source,context);
 const run=code=>vm.runInContext(code,context);
 context.onRender=()=>state.renders++;
 run("me={id:'viewer'};tab='inbox';render=()=>onRender();paintMessages=()=>{};");
 return {state,run,storage};
}
test('an empty inbox polls and discovers its first incoming conversation',async()=>{
 const {state,run}=harness();run('startPoll()');assert.equal(typeof state.poll,'function');
 state.result={threads:[{id:'incoming',member:{name:'Slug'}}]};await state.poll();
 assert.equal(run('activeChat'),'incoming');assert.equal(state.renders,1);
 assert.deepEqual(state.calls,['/api/threads']);
});
test('mobile conversation list does not mark unopened conversations as read',async()=>{
 const {state,run}=harness();state.result={threads:[{id:'unread',member:{name:'Slug'},unreadCount:2}]};
 await run("enterTab('inbox')");assert.deepEqual(state.calls,['/api/threads']);
 assert.equal(run('mobileChatOpen'),false);assert.equal(run('threads[0].unreadCount'),2);
});
test('removed active conversations clear stale messages and return to mobile list',async()=>{
 const {state,run}=harness();run("activeChat='gone';mobileChatOpen=true;messages=[{text:'old'}]");
 await run('loadThreads()');assert.equal(run('activeChat'),null);assert.equal(run('messages.length'),0);assert.equal(run('mobileChatOpen'),false);
});



test('artist search renders immediate local matches, excludes selected names and retains custom entry',()=>{
 const {run}=harness();run("draft={artists:['Clairo']};artistQuery='Tirzah';artistRemoteResults=[{name:'TIRZAH',description:'UK artist'}]");
 assert.equal(run('artistSuggestions().length'),1);
 assert.match(run('artistOptions()'),/Add “Tirzah”/);
 assert.match(run('artistOptions()'),/UK artist/);
 run("artistQuery='Clairo';artistRemoteResults=[{name:'Clairo'}]");assert.equal(run('artistSuggestions().length'),0);
 assert.doesNotMatch(run('artistOptions()'),/data-action="add-artist"/);
 run("artistQuery='<new artist>'");assert.match(run('artistOptions()'),/&lt;new artist&gt;/);
});

test('artist network search debounces, ignores stale replies and caches successful queries',async()=>{
 const {run,state}=harness();run("tab='profile';draft={artists:[]};updateArtistSearch=()=>{};artistQuery='Tirzah';scheduleArtistSearch()");
 assert.equal(state.timers.at(-1).delay,650);assert.equal(state.calls.length,0);
 const deferred=[];state.artistHandler=()=>new Promise(resolve=>deferred.push(resolve));
 const first=run("fetchArtistSuggestions('Tirzah',artistSearchVersion)");
 run("artistQuery='Grouper';scheduleArtistSearch()");
 const second=run("fetchArtistSuggestions('Grouper',artistSearchVersion)");
 deferred[1]({artists:[{id:'b',name:'Grouper'}]});await second;
 deferred[0]({artists:[{id:'a',name:'Tirzah'}]});await first;
 assert.equal(run('artistRemoteResults[0].name'),'Grouper');
 const before=state.timers.length;run('scheduleArtistSearch()');
 assert.equal(state.timers.length,before);assert.equal(run('artistSearchState'),'ready');
 assert.equal(state.calls.length,2);
});

test('artist network failures retain custom entry and local fallback',async()=>{
 const {run,state}=harness();run("tab='profile';draft={artists:[]};updateArtistSearch=()=>{};artistQuery='Dean';scheduleArtistSearch()");
 state.artistHandler=async()=>{throw new Error('Unavailable');};
 await run("fetchArtistSuggestions('Dean',artistSearchVersion)");
 assert.equal(run('artistSearchState'),'error');assert.match(run('artistOptions()'),/Dean Blunt/);assert.match(run('artistOptions()'),/Add “Dean”/);
 assert.match(run('artistStatus()'),/You can still add this name/);
});


test('empty artist search results remain a successful search with manual entry available',async()=>{
 const {run,state}=harness();run("tab='profile';draft={artists:[]};updateArtistSearch=()=>{};artistQuery='Unknown niche artist';scheduleArtistSearch()");
 state.artistHandler=async()=>({artists:[],source:'Apple'});
 await run("fetchArtistSuggestions('Unknown niche artist',artistSearchVersion)");
 assert.equal(run('artistSearchState'),'ready');
 assert.doesNotMatch(run('artistStatus()'),/couldn’t load/);
 assert.match(run('artistOptions()'),/Add “Unknown niche artist”/);
 assert.match(run('picker()'),/MusicBrainz/);assert.match(run('picker()'),/Apple/);
});


test('successful artist results persist as a public catalog and match partial names immediately after reload',async()=>{
 const {run,state,storage}=harness();run("tab='profile';draft={artists:[]};updateArtistSearch=()=>{};artistQuery='Grouper';scheduleArtistSearch()");
 state.artistHandler=async()=>({artists:[{id:'mb-grouper',name:'Grouper',description:'Ambient musician',query:'private search',memberId:'never-store'}]});
 await run("fetchArtistSuggestions('Grouper',artistSearchVersion)");
 const saved=JSON.parse(storage.get('slug-artist-catalog-v1'));
 assert.equal(saved.length,1);assert.deepEqual(Object.keys(saved[0]).sort(),['cachedAt','description','id','name']);
 assert.doesNotMatch(storage.get('slug-artist-catalog-v1'),/query|memberId|never-store/);
 const reloaded=harness(390,storage);reloaded.run("tab='profile';draft={artists:[]};updateArtistSearch=()=>{};artistQuery='grou';scheduleArtistSearch()");
 assert.equal(reloaded.state.calls.length,0);
 assert.equal(reloaded.run('artistSuggestions()[0].name'),'Grouper');
 assert.match(reloaded.run('artistOptions()'),/Ambient musician/);
 assert.equal(reloaded.state.timers.at(-1).delay,650,'remote refresh still follows immediate catalog suggestions');
});

test('artist catalog rejects malformed, expired and oversized stored records without breaking search',()=>{
 const key='slug-artist-catalog-v1',now=Date.now();
 const storage=new Map([[key,JSON.stringify([
 {id:'valid',name:'Fresh Artist',description:'Valid',cachedAt:now},
 {id:'expired',name:'Old Artist',description:'Old',cachedAt:now-31*86400000},
 {id:'future',name:'Future Artist',description:'Bad',cachedAt:now+86400000},
 {id:'long-name',name:'a'.repeat(121),description:'Bad',cachedAt:now},
 {id:'long-desc',name:'Bad Description',description:'a'.repeat(161),cachedAt:now},
 {id:'a'.repeat(161),name:'Bad Identifier',description:'Bad',cachedAt:now},
 {id:'missing-date',name:'Missing Date',description:'Bad'},
 null
 ])]]);
 const {run}=harness(390,storage);assert.equal(run('publicArtistCatalog.length'),1);assert.equal(run('publicArtistCatalog[0].name'),'Fresh Artist');
 const invalid=harness(390,new Map([[key,'{not json']]));assert.equal(invalid.run('publicArtistCatalog.length'),0);
});

test('public artist catalog is bounded and storage failure leaves in-memory suggestions available',()=>{
 const {run,storage}=harness();
 run("rememberPublicArtists(Array.from({length:550},(_,i)=>({id:'artist-'+i,name:'Public Artist '+i,description:''})))");
 assert.equal(run('publicArtistCatalog.length'),500);assert.equal(JSON.parse(storage.get('slug-artist-catalog-v1')).length,500);
 run("localStorage.setItem=()=>{throw new Error('Unavailable')};rememberPublicArtists([{id:'offline',name:'Offline Musician',description:'Still available'}]);draft={artists:[]};artistQuery='offline'");
 assert.equal(run('artistSuggestions()[0].name'),'Offline Musician');
});
