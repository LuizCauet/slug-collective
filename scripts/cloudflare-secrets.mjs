import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const origin=new URL(process.argv[2]||'');
if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Provide the exact HTTPS production origin, with no path.');
const values={};
for(const line of (await readFile(new URL('../.dev.vars',import.meta.url),'utf8')).split(/\r?\n/)){
 const m=line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(!m)continue;
 let value=m[2];if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
 values[m[1]]=value;
}
const keys=['DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','INITIAL_INVITE_CODE','ADMIN_DISCORD_IDS'];
if(keys.some(key=>!values[key]))throw new Error('Complete the four Discord setup fields in .dev.vars first.');
if(values.INITIAL_INVITE_CODE.length<24)throw new Error('Use a bootstrap invite of at least 24 characters.');
const secrets=Object.fromEntries(keys.map(key=>[key,values[key]]));
secrets.APP_ORIGIN=origin.origin;secrets.MUSIC_CONTACT_URL=origin.origin;
// Values flow directly from local memory into Wrangler's stdin, never stdout or argv.
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),'secret','bulk'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['pipe','inherit','inherit']});
child.stdin.end(JSON.stringify(secrets));
child.on('error',()=>{console.error('Unable to start Wrangler.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
