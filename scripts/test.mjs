import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory=new URL('../tests/',import.meta.url);
const files=(await readdir(directory)).filter(name=>name.endsWith('.test.js')).sort().map(name=>fileURLToPath(new URL(name,directory)));
if(!files.length)throw new Error('No test files found.');
const child=spawn(process.execPath,['--test',...files],{stdio:'inherit'});
child.on('error',()=>{process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
