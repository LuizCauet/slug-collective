import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {genreSuggestions} from '../web/genres.js';
import {rankMembers} from '../web/matching.js';
const source=(await readFile(new URL('../web/app.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/^boot\(\);$/m,'');
function harness(width=390,storage=new Map()){
 const node={addEventListener(){},classList:{toggle(){},add(){},remove(){}},setAttribute(){},innerHTML:'',focus(){state.focused=true;},select(){state.selected=true;}};
 const state={poll:null,calls:[],result:{threads:[]},renders:0,timers:[],artistHandler:null,apiHandler:null,listeners:{},requests:[]};
 const context=vm.createContext({localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},document:{hidden:false,querySelector:selector=>selector==='#profile-form'?null:node,addEventListener:(type,fn)=>(state.listeners[type]??=[]).push(fn)},window:{innerWidth:width,addEventListener(){},scrollTo(){}},location:{search:''},URL,URLSearchParams,structuredClone,crypto:globalThis.crypto,AbortController,genreSuggestions,rankMembers,musicArt:{},artistCatalog:['Tirzah','Dean Blunt','Clairo'],normalizeArtist:s=>String(s).normalize('NFKC').trim().toLowerCase(),setTimeout:(fn,delay)=>(state.timers.push({fn,delay}),state.timers.length),clearTimeout(){},setInterval:fn=>(state.poll=fn,1),clearInterval(){},api:async(path,options)=>{state.calls.push(path);state.requests.push({path,options});if(state.apiHandler)return state.apiHandler(path,options);if(path.startsWith('/api/artists/'))return state.artistHandler?state.artistHandler(path):{artists:[]};return path==='/api/threads'?state.result:{messages:[]};}});
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


test('new accounts skip directory loading until artist onboarding is completed',async()=>{
 const {run,state}=harness();state.apiHandler=async path=>path==='/api/config'?{discordConfigured:true}:{authenticated:true,csrf:'csrf',user:{id:'new',name:'New',artists:[],roles:[],onboardingCompleted:false}};
 run('setCsrf=()=>{}');await run('boot()');
 assert.equal(run('me.onboardingCompleted'),false);
 assert.equal(state.calls.includes('/api/members'),false);
});

test('artist onboarding requires three distinct names and exposes a focused heading without navigation',()=>{
 const {run}=harness();run("me={onboardingCompleted:false};draft={artists:['Clairo','clairo','Tirzah']};artistQuery=''");
 assert.equal(run('onboardingArtistCount()'),2);
 assert.match(run('artistOnboarding()'),/<main class="artist-onboarding">/);
 assert.match(run('artistOnboarding()'),/id="onboarding-heading" tabindex="-1"/);
 assert.match(run('artistOnboarding()'),/id="onboarding-submit" type="submit" disabled/);
 assert.doesNotMatch(run('artistOnboarding()'),/<nav/);
 run("draft.artists.push('Grouper')");assert.equal(run('onboardingArtistCount()'),3);
 assert.doesNotMatch(run('artistOnboarding()'),/id="onboarding-submit" type="submit" disabled/);
});

test('onboarding saves artists before directory access and preserves draft after save failure',async()=>{
 const {run,state}=harness();run("me={id:'new',onboardingCompleted:false};tab='onboarding';draft={artists:['Clairo','Tirzah','Grouper']};setCsrf=()=>{}");
 const submit=state.listeners.submit[0],button={disabled:false,isConnected:false};
 const event={target:{id:'onboarding-form',querySelector:()=>button},preventDefault(){}};
 state.apiHandler=async()=>{throw new Error('Connection lost. Please try again.');};
 await submit(event);assert.equal(run('onboardingStep'),1);assert.equal(state.calls.length,0);
 await submit(event);
 assert.equal(run('draft.artists.length'),3);assert.match(run('onboardingError'),/Connection lost/);
 assert.equal(state.calls.includes('/api/members'),false);
 state.apiHandler=async path=>path==='/api/onboarding'?{user:{id:'new',name:'New',artists:['Clairo','Tirzah','Grouper'],manualArtists:['Clairo','Tirzah','Grouper'],roles:[],onboardingCompleted:true}}:{members:[]};
 await submit(event);
 assert.equal(run('me.onboardingCompleted'),true);assert.equal(run('tab'),'people');
 assert.deepEqual(state.calls.slice(-2),['/api/onboarding','/api/members']);
 assert.equal(state.requests.at(-2).options.method,'POST');
 assert.equal(state.requests.at(-2).options.body.artists.length,3);
});


test('invite share panel presents an escaped full URL, expiry and explicit copy control',()=>{
 const {run}=harness();
 const html=run("inviteSharePanel({url:'https://club.example/i/0123456789abcdef?x=\"<&',expiresAt:Date.now()+30*86400000})");
 assert.match(html,/Your club invite/);assert.match(html,/readonly/);assert.match(html,/type="button" data-action="copy-invite"/);assert.match(html,/class="copy-invite-label">Copy link/);
 assert.match(html,/class="copy-icon-default"/);assert.match(html,/class="copy-icon-success"/);assert.doesNotMatch(html,/copy-state-ready|is-copied/);
 assert.match(html,/Expires in 30 days/);assert.match(html,/only shown once/);
 assert.match(html,/&quot;&lt;&amp;/);
});

test('invite copy writes the full link or selects it when clipboard access fails',async()=>{
 const {run,state}=harness();
 run("toast=message=>globalThis.lastToast=message;document.querySelector('#invite-url').value='https://club.example/i/0123456789abcdef';globalThis.navigator={clipboard:{writeText:async value=>globalThis.copied=value}}");
 await run('copyInviteLink()');assert.equal(run('copied'),'https://club.example/i/0123456789abcdef');assert.equal(run('lastToast'),'Invite link copied.');
 run("navigator.clipboard.writeText=async()=>{throw new Error('Denied')}");
 await run('copyInviteLink()');assert.equal(state.focused,true);assert.equal(state.selected,true);assert.match(run('lastToast'),/Copy it manually/);
 state.selected=false;run('globalThis.navigator={}');await run('copyInviteLink()');assert.equal(state.selected,true);
});

test('icons use one currentColor outline style with constant rendered stroke widths',()=>{
 const {run}=harness();
 for(const name of ['people','create','inbox','profile','search','arrow','music','close','send','link','check','copy']){
  const html=run(`icon('${name}')`);
  assert.match(html,/class="ui-icon"/);assert.match(html,/fill="none" stroke="currentColor"/);
  assert.match(html,/vector-effect="non-scaling-stroke"/);assert.match(html,/focusable="false"/);
 }
});

test('invite copy success persists static feedback for two seconds and stale timers cannot reset newer feedback',async()=>{
 const {run,state}=harness();
 run(`globalThis.copyClasses=new Set();globalThis.copyLabel={textContent:'Copy link'};
 globalThis.copyButton={isConnected:true,offsetWidth:100,classList:{add:name=>copyClasses.add(name),toggle:(name,enabled)=>enabled?copyClasses.add(name):copyClasses.delete(name)},querySelector:()=>copyLabel};
 globalThis.copyInput={value:'https://club.example/i/test',focus(){},select(){}};
 document.querySelector=selector=>selector==='#invite-url'?copyInput:selector==='[data-action="copy-invite"]'?copyButton:null;
 globalThis.navigator={clipboard:{writeText:async()=>{}}};toast=()=>{};`);
 assert.equal(run("copyClasses.has('copy-state-ready')"),false);
 await run('copyInviteLink()');
 assert.equal(run('copyLabel.textContent'),'Copied');assert.equal(run("copyClasses.has('is-copied')"),true);
 assert.equal(state.timers[0].delay,2000);
 const oldReset=state.timers[0].fn;
 await run('copyInviteLink()');oldReset();
 assert.equal(run('copyLabel.textContent'),'Copied','a stale reset must not clear the newest success');
 state.timers.at(-1).fn();assert.equal(run('copyLabel.textContent'),'Copy link');assert.equal(run("copyClasses.has('is-copied')"),false);
 await run('copyInviteLink()');run('copyButton.isConnected=false');state.timers.at(-1).fn();
 assert.equal(run('copyLabel.textContent'),'Copied','detached buttons are never mutated by timers');
});

test('Spotify export help qualifies the one-day estimate and keeps the direct privacy link',()=>{
 const {run}=harness();run('draft={provider:null};me={}');
 const html=run('serviceControls()');assert.match(html,/may arrive in about a day/);assert.match(html,/up to 30 days/);assert.match(html,/https:\/\/www.spotify.com\/account\/privacy\//);
});

test('Spotify import progress reports real file counts without inventing a percentage',()=>{
 const {run}=harness();assert.match(run("spotifyProgressText({phase:'reading',files:37,listens:12345})"),/37 files read/);
 assert.match(run("spotifyProgressText({phase:'reading',files:37,listens:12345})"),/12,345 listens/);
 assert.doesNotMatch(run("spotifyProgressText({phase:'reading',files:37,listens:12345})"),/%/);
 assert.match(run("spotifyProgressText({phase:'reading',files:18,percent:48.6})"),/49%/);
 assert.doesNotMatch(run("spotifyProgressText({phase:'reading',files:37,percent:101})"),/%/);
});


test('genres are normalized without a selection cap and custom duplicates receive inline feedback',()=>{
 const {run}=harness();run('draft={genres:[]}');
 assert.equal(run("changeGenre('  UK   garage  ')"),true);assert.equal(run('draft.genres[0]'),'UK garage');
 assert.equal(run("changeGenre('uk garage')"),false);assert.match(run('genreError'),/already selected/);
 assert.equal(run("changeGenre('a'.repeat(41))"),false);assert.match(run('genreError'),/40 characters/);
 run("draft.genres=Array.from({length:10},(_,i)=>'Genre '+i)");
 assert.equal(run("changeGenre('One more')"),true);assert.equal(run('draft.genres.length'),11);
 assert.equal(run("changeGenre('Genre 0',true)"),true);assert.equal(run('draft.genres.length'),10);
 assert.equal(run("changeGenre('<custom>')"),true);assert.match(run('genreEditor()'),/&lt;custom&gt;/);
});

test('optional onboarding genres can go back without losing artists and skip sends an empty genre list',async()=>{
 const {run,state}=harness();run("me={id:'new',onboardingCompleted:false};tab='onboarding';draft={artists:['Clairo','Tirzah','Grouper'],genres:['Shoegaze']};onboardingStep=1");
 const html=run('artistOnboarding()');assert.match(html,/What genres are you into/);assert.match(html,/Skip for now/);assert.match(html,/aria-pressed="true"/);
 const back={dataset:{action:'onboarding-back'},isConnected:false};
 await state.listeners.click[0]({target:{closest:()=>back}});
 assert.equal(run('onboardingStep'),0);assert.equal(run('draft.artists.length'),3);assert.equal(run('draft.genres[0]'),'Shoegaze');
 run('onboardingStep=1');state.apiHandler=async path=>path==='/api/onboarding'?{user:{id:'new',name:'New',artists:['Clairo','Tirzah','Grouper'],genres:[],roles:[],onboardingCompleted:true}}:{members:[]};
 await run('finishOnboarding(true)');
 assert.equal(state.requests[0].path,'/api/onboarding');assert.equal(state.requests[0].options.body.genres.length,0);assert.equal(state.requests[0].options.body.artists.length,3);
});

test('genre input Enter never submits the parent form and retains other unsaved profile fields',async()=>{
 const {run,state}=harness();run("tab='profile';draft={genres:[],artists:[],roles:[]};globalThis.fixtureForm={elements:Object.fromEntries(['name','bio','pronouns','college','intent','workTitle','workUrl'].map(k=>[k,{value:'unsaved '+k}]))};fixtureForm.elements.openToCollaborating={checked:false};globalThis.baseQuery=document.querySelector;document.querySelector=s=>s==='#profile-form'?fixtureForm:baseQuery(s)");
 const keydown=state.listeners.keydown.at(-1);let prevented=0;
 await keydown({target:{id:'genre-input',value:'Dream pop'},key:'Enter',preventDefault(){prevented++;}});
 assert.equal(prevented,1);assert.equal(run('draft.name'),'unsaved name');assert.equal(run('draft.bio'),'unsaved bio');assert.equal(run('draft.genres[0]'),'Dream pop');assert.equal(state.requests.length,0);
 await keydown({target:{id:'genre-input',value:''},key:'Enter',preventDefault(){prevented++;}});
 assert.equal(prevented,2);assert.match(run('genreError'),/Enter a genre name/);assert.equal(state.requests.length,0);
});

test('member genres render escaped tags and completed accounts normalize missing genres without onboarding reset',()=>{
 const {run}=harness();assert.match(run("memberGenres({genres:['Shoegaze','<unsafe>']})"),/Shoegaze/);assert.match(run("memberGenres({genres:['<unsafe>']})"),/&lt;unsafe&gt;/);
 assert.equal(run("normalize({id:'existing',onboardingCompleted:true}).onboardingCompleted"),true);
 assert.equal(run("normalize({id:'existing'}).genres.length"),0);
});

test('profile shows one pane and section navigation retains hidden draft values and artist query',()=>{
 const {run}=harness();run("me=normalize({id:'me',name:'Me',bio:'Saved bio',artists:['Tirzah'],roles:['Production'],genres:['Shoegaze'],intent:'Original intent',workTitle:'Original work',openToCollaborating:true});draft=createDraft(me);tab='profile';profileSection='about';artistQuery='Grouper'");
 const html=run('profile()');assert.match(html,/aria-label="Profile sections"/);assert.doesNotMatch(html,/role="tablist"/);assert.match(html,/name="name"/);assert.doesNotMatch(html,/id="artist-search"|id="creative-toggle"|Connect services/);
 run("globalThis.fixtureForm={elements:{name:{value:'Edited name'},bio:{value:'Edited bio'}}};globalThis.baseQuery=document.querySelector;document.querySelector=s=>s==='#profile-form'?fixtureForm:baseQuery(s);switchProfileSection('music')");
 assert.equal(run('draft.name'),'Edited name');assert.equal(run('draft.bio'),'Edited bio');assert.equal(run('draft.workTitle'),'Original work');assert.equal(run('draft.openToCollaborating'),true);assert.equal(run('artistQuery'),'Grouper');
 assert.equal(run('draft.genres[0]'),'Shoegaze');
 run("fixtureForm.elements={intent:{value:'New intent'},openToCollaborating:{checked:false}};switchProfileSection('services')");
 assert.equal(run('draft.intent'),'New intent');assert.equal(run('draft.name'),'Edited name');assert.equal(run('draft.openToCollaborating'),false);assert.match(run('profilePane(draft)'),/Connect services/);assert.doesNotMatch(run('profilePane(draft)'),/id="artist-search"|id="genre-editor"/);
});

test('custom genre editor starts collapsed and selected suggestion genres are not duplicated as removable pills',()=>{
 const {run}=harness();run("draft={genres:['Shoegaze','Custom scene']};genreCustomOpen=false;tab='profile'");
 const html=run('genreEditor()');assert.match(html,/Add custom genre/);assert.match(html,/aria-expanded="false"/);assert.doesNotMatch(html,/id="genre-input"/);
 assert.doesNotMatch(html,/data-action="genre-remove" data-genre="Shoegaze"/);assert.match(html,/data-action="genre-remove" data-genre="Custom scene"/);
 run('genreCustomOpen=true');const open=run('genreEditor()');assert.match(open,/Genre name/);assert.match(open,/id="genre-input" maxlength="40"/);assert.doesNotMatch(open,/placeholder=/);
});

test('adding a custom genre closes its editor while Escape and Cancel preserve all selected choices',async()=>{
 const {run,state}=harness();run("draft={genres:['Shoegaze'],artists:[]};genreCustomOpen=true;genreQuery='';globalThis.baseQuery=document.querySelector;document.querySelector=s=>{const node=baseQuery(s);if(s==='#genre-input')node.value='Dreampunk';return node;}");
 run('addCustomGenre()');assert.equal(run('genreCustomOpen'),false);assert.equal(run('draft.genres[1]'),'Dreampunk');assert.equal(state.focused,true);
 run("genreCustomOpen=true;genreQuery='Unsubmitted'");let prevented=false,stopped=false;
 await state.listeners.keydown.at(-1)({target:{id:'genre-input'},key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
 assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(run('genreCustomOpen'),false);assert.equal(run('genreQuery'),'');assert.equal(run('draft.genres.length'),2);
 run("genreCustomOpen=true;genreQuery='Other draft'");const cancel={dataset:{action:'genre-custom-cancel'},isConnected:false};await state.listeners.click[0]({target:{closest:()=>cancel}});
 assert.equal(run('genreCustomOpen'),false);assert.equal(run('draft.genres.length'),2);assert.equal(state.requests.length,0);
});

test('saving from a profile pane submits the complete draft including fields absent from that pane',async()=>{
 const {run,state}=harness();run("me=normalize({id:'me',name:'Keep name',bio:'Keep bio',artists:['Tirzah'],manualArtists:['Tirzah'],roles:['Production'],genres:['Shoegaze'],intent:'Keep intent',workTitle:'Keep work',workUrl:'https://example.com/work',openToCollaborating:true});draft=createDraft(me);tab='profile';profileSection='music';globalThis.fixtureForm={elements:{}};globalThis.baseQuery=document.querySelector;document.querySelector=s=>s==='#profile-form'?fixtureForm:baseQuery(s)");
 state.apiHandler=async(path,options)=>({user:{id:'me',...options.body,manualArtists:options.body.artists}});
 const button={isConnected:false};await state.listeners.submit[0]({target:{id:'profile-form',querySelector:()=>button},preventDefault(){}});
 const body=state.requests[0].options.body;assert.equal(body.name,'Keep name');assert.equal(body.bio,'Keep bio');assert.equal(body.intent,'Keep intent');assert.equal(body.roles[0],'Production');assert.equal(body.genres[0],'Shoegaze');assert.equal(body.workTitle,'Keep work');assert.equal(body.openToCollaborating,true);
});

test('large Spotify imports remain collapsed behind a compact source summary',()=>{
 const {run}=harness();run("me={artists:[],manualArtists:[],spotify:{artists:Array.from({length:200},(_,i)=>({name:'Artist '+i}))}};");
 const html=run('importedArtists()');assert.match(html,/<details class="imported-source"><summary>Spotify · 200 artists/);assert.doesNotMatch(html,/<details[^>]* open/);assert.match(html,/\+188 more/);
});


test('Shared taste includes artist or genre overlap and preserves real combined-score ordering',()=>{
 const {run}=harness();run("tab='people';filter='Shared taste';query='';me=normalize({id:'me',artists:['Tirzah'],genres:['Shoegaze','Dream pop'],roles:['Production']});members=[{id:'genre',name:'Genre friend',artists:['Unrelated artist'],genres:['Shoegaze','Dream pop'],roles:[]},{id:'none',name:'New taste',artists:['Other artist'],genres:['Jazz'],roles:[]},{id:'artist',name:'Artist friend',artists:['Tirzah'],genres:[],roles:[]},{id:'both',name:'Both friend',artists:['Tirzah'],genres:['Shoegaze'],roles:[]}].map(normalize)");
 assert.equal(run("visible().map(m=>m.id).join(',')"),'both,artist,genre');
 assert.equal(run('visible()[0].artistOverlapCount'),1);assert.equal(run('visible()[0].genreOverlapCount'),1);
 const html=run('results()');assert.match(html,/Best matches first/);assert.equal(html.indexOf('Both friend')<html.indexOf('Artist friend'),true);assert.equal(html.indexOf('Artist friend')<html.indexOf('Genre friend'),true);
 run("filter='All people';query='dream pop'");assert.equal(run("visible().map(m=>m.id).join(',')"),'genre');
});

test('People cards report accurate overlap counts and genre-only cards never imply an unrelated artist is shared',()=>{
 const {run}=harness();run("tab='people';me=normalize({artists:['Tirzah'],genres:['Cloud rap','Dream pop'],roles:[]});members=[{id:'genre',name:'Genre friend',artists:['Unrelated artist'],genres:['Cloud rap','Dream pop'],roles:[]},{id:'artist',name:'Artist friend',artists:['Tirzah'],genres:[],roles:[]},{id:'none',name:'New friend',artists:['Other artist'],genres:[],roles:[]}].map(normalize)");
 const genreHtml=run("card(rankMembers(members,me).find(m=>m.id==='genre'))");assert.match(genreHtml,/0 shared artists · 2 shared genres/);assert.match(genreHtml,/Shared genres: Cloud rap · Dream pop/);assert.match(genreHtml,/>Listening to</);assert.doesNotMatch(genreHtml,/You both listen to/);
 assert.match(run("card(rankMembers(members,me).find(m=>m.id==='artist'))"),/1 shared artist · 0 shared genres/);
 assert.match(run("card(rankMembers(members,me).find(m=>m.id==='none'))"),/0 shared artists · 0 shared genres/);
});

test('genre-only match descriptions and chat context escape member data with singular wording',()=>{
 const {run}=harness();run("tab='people';me=normalize({artists:[],genres:['<Cloud rap>'],roles:[]});members=[normalize({id:'genre',name:'<Friend>',artists:['<Unrelated artist>'],genres:['<Cloud rap>'],roles:[]})]");
 const html=run('card(rankMembers(members,me)[0])');assert.match(html,/0 shared artists · 1 shared genre/);assert.match(html,/Shared genre: &lt;Cloud rap&gt;/);assert.match(html,/data-context="Shared genre: &lt;Cloud rap&gt;"/);assert.match(html,/&lt;Friend&gt;/);assert.doesNotMatch(html,/<Cloud rap>|<Friend>|You both listen to/);
});

test('Create recommendations retain complementary-role ranking and copy after genre matching',()=>{
 const {run}=harness();run("tab='create';filter='All creatives';query='';me=normalize({artists:[],genres:['Shoegaze'],roles:['Production']});members=[normalize({id:'vocal',name:'Vocalist',artists:[],genres:['Shoegaze'],roles:['Vocals'],openToCollaborating:true}),normalize({id:'closed',name:'Closed',artists:[],genres:['Shoegaze'],roles:['Vocals'],openToCollaborating:false})]");
 assert.equal(run('visible().length'),1);assert.equal(run('visible()[0].id'),'vocal');assert.match(run('card(visible()[0])'),/Your production \+ their vocals/);
});

test('People cards handle members with no artist list and still explain genre-only matches',()=>{
 const {run}=harness();run("tab='people';filter='Shared taste';query='';me=normalize({genres:['Cloud rap']});members=[normalize({id:'genre',name:'Genre friend',genres:['Cloud rap']}),normalize({id:'empty',name:'New friend'})]");
 assert.equal(run('visible().length'),1);const html=run('card(visible()[0])');assert.match(html,/0 shared artists · 1 shared genre/);assert.match(html,/Shared genre: Cloud rap/);assert.doesNotMatch(html,/You both listen to|undefined/);
 run("filter='All people'");assert.match(run("card(visible().find(m=>m.id==='empty'))"),/0 shared artists · 0 shared genres/);
});

test('genre selection counts use natural wording in onboarding and Profile with more than ten choices',()=>{
 const {run}=harness();run("draft={genres:Array.from({length:14},(_,i)=>'Genre '+i)};tab='onboarding'");
 assert.match(run('genreEditor()'),/14 genres selected/);assert.doesNotMatch(run('genreEditor()'),/\/ 10/);
 run("tab='profile'");assert.match(run('genreEditor()'),/14 genres selected/);
 run("draft.genres=['Shoegaze']");assert.match(run('genreEditor()'),/1 genre selected/);
});

test('Profile and onboarding saves submit more than ten genres without truncation',async()=>{
 for(const mode of ['profile','onboarding']){
  const {run,state}=harness();run(`me=normalize({id:'viewer',name:'Member',artists:['Tirzah','Clairo','Grouper'],roles:[],onboardingCompleted:${mode==='profile'}});draft=createDraft(me);draft.genres=Array.from({length:14},(_,i)=>'Genre '+i);tab='${mode}';onboardingStep=1;toast=()=>{}`);
  state.apiHandler=async(path,options)=>path==='/api/members'?{members:[]}:{user:{id:'viewer',name:'Member',artists:['Tirzah','Clairo','Grouper'],roles:[],...options.body,onboardingCompleted:true}};
  const button={isConnected:false};await state.listeners.submit[0]({target:{id:mode==='profile'?'profile-form':'onboarding-form',querySelector:()=>button},preventDefault(){}});
  assert.equal(state.requests[0].path,mode==='profile'?'/api/profile':'/api/onboarding');assert.equal(state.requests[0].options.body.genres.length,14);assert.equal(state.requests[0].options.body.genres[13],'Genre 13');
 }
});
