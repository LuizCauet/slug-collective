import {execFileSync} from 'node:child_process';
const paths=execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const privatePath=/(^|\/)(?:\.dev\.vars(?:\..*)?|\.env(?:\..*)?|\.wrangler|\.mf|\.local|node_modules|dist)(?:\/|$)|\.(?:db(?:-.*)?|sqlite(?:3)?(?:-.*)?|pem|key|zip|tar\.gz|log)$/i;
const findings=paths.filter(path=>path!=='.env.example'&&(privatePath.test(path)||(/\.sql$/i.test(path)&&!/^drizzle\/\d{4}_[\w-]+\.sql$/.test(path))));
if(findings.length){console.error('Private or generated files must not be tracked:\n'+findings.join('\n'));process.exitCode=1;}
else console.log(`Public file check passed: ${paths.length} tracked paths; no environment secrets, runtime databases, exports, private keys, logs, or build output.`);
