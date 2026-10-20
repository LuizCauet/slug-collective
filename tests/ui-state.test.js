import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../web/app.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/^boot\(\);$/m,'');
function harness(width=390){
 const node={addEventListener(){},classList:{toggle(){}},innerHTML:''};
 const state={poll:null,calls:[],result:{threads:[]},renders:0};
 const context=vm.createContext({document:{hidden:false,querySelector:selector=>selector==='#profile-form'?null:node,addEventListener(){}},window:{innerWidth:width,addEventListener(){},scrollTo(){}},location:{search:''},URL,URLSearchParams,structuredClone,crypto:globalThis.crypto,setTimeout,clearTimeout,setInterval:fn=>(state.poll=fn,1),clearInterval(){},api:async path=>{state.calls.push(path);return path==='/api/threads'?state.result:{messages:[]};}});
 vm.runInContext(source,context);
 const run=code=>vm.runInContext(code,context);
 context.onRender=()=>state.renders++;
 run("me={id:'viewer'};tab='inbox';render=()=>onRender();paintMessages=()=>{};");
 return {state,run};
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

