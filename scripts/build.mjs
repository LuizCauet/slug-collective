import {readFile, readdir, mkdir, writeFile, rm, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'web');
const output = path.resolve(root, 'dist');
const types = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png',
  '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2',
  '.json':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8'
};
const assets = {};
async function collect(directory) {
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Web assets must not be symbolic links.');
    // Keep original club artwork in source; bundle only the selected web assets.
    if (entry.isDirectory() && entry.name === 'Slug Collective Assets' && directory === path.join(source,'assets')) continue;
    if (entry.isDirectory()) await collect(absolute);
    else if (entry.isFile()) {
      const type = types[path.extname(entry.name).toLowerCase()];
      if (!type) throw new Error(`Unsupported web asset extension: ${path.extname(entry.name)}`);
      const key = '/' + path.relative(source, absolute).split(path.sep).join('/');
      assets[key] = {type, base64:(await readFile(absolute)).toString('base64')};
    }
  }
}
await collect(source);
if (!assets['/index.html']) throw new Error('web/index.html is required.');
await mkdir(path.join(root,'.local'), {recursive:true});
await writeFile(path.join(root,'.local','assets.generated.js'), `// Generated from web/; do not edit.\nexport default ${JSON.stringify(assets)};\n`);
// Never remove a computed path unless it is exactly this project's dist folder.
if (output !== path.join(root,'dist') || path.dirname(output) !== root) throw new Error('Unsafe build output path.');
await rm(output, {recursive:true,force:true});
await mkdir(path.join(output,'server'), {recursive:true});
await build({entryPoints:[path.join(root,'server','entry.js')], outfile:path.join(output,'server','index.js'),
  bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'none',sourcemap:false});
await mkdir(path.join(output,'.openai'), {recursive:true});
await copyFile(path.join(root,'.openai','hosting.json'),path.join(output,'.openai','hosting.json'));
console.log(`Built worker with ${Object.keys(assets).length} bundled web assets.`);
