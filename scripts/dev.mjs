import {readFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 5174);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
const bindings = {APP_ORIGIN:`http://127.0.0.1:${port}`};
try {
  const contents = await readFile(path.join(root,'.dev.vars'),'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith('#')) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value=value.slice(1,-1);
    else value=value.replace(/\s+#.*$/,'');
    bindings[match[1]]=value;
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }

await import('./build.mjs');
await mkdir(path.join(root,'.mf','d1'), {recursive:true});
const mf = new Miniflare({
  modules:true,scriptPath:path.join(root,'dist','server','index.js'),
  compatibilityDate:'2024-12-30',host:'127.0.0.1',port,
  d1Databases:['DB'],d1Persist:path.join(root,'.mf','d1'),bindings
});
try {
  const db = await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL, applied_at INTEGER NOT NULL)').run();
  const directory=path.join(root,'drizzle');
  const journal=JSON.parse(await readFile(path.join(directory,'meta','_journal.json'),'utf8'));
  for (const entry of journal.entries) {
    const name=`${entry.tag}.sql`;
    if (!/^[A-Za-z0-9_-]+\.sql$/.test(name)) throw new Error('Invalid migration journal entry.');
    const sql=await readFile(path.join(directory,name),'utf8');
    const hash=createHash('sha256').update(sql).digest('hex');
    const previous=await db.prepare('SELECT hash FROM _migrations WHERE name = ?').bind(name).first();
    if (previous) {
      if (previous.hash !== hash) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    const statements=sql.split('--> statement-breakpoint').map(part=>part.trim()).filter(Boolean);
    await db.batch([...statements.map(statement=>db.prepare(statement)),
      db.prepare('INSERT INTO _migrations (name, hash, applied_at) VALUES (?, ?, ?)').bind(name,hash,Date.now())]);
  }
  await mf.ready;
  console.log(`Slug Collective: http://127.0.0.1:${port}`);
  console.log('Discord credentials and club invite configuration belong in .dev.vars.');
} catch (error) {
  await mf.dispose();
  throw error;
}
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await mf.dispose();process.exit(0);});
// Export for local integration tooling; authentication uses the same production path.
export {mf};
