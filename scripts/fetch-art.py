"""Cache album artwork from Apple's public iTunes catalog for the demo."""
import concurrent.futures
import json
from pathlib import Path
import re
import subprocess
import time
import unicodedata
import urllib.parse
import urllib.request

root = Path(__file__).resolve().parents[1]
target = root / 'dist/assets/covers'
target.mkdir(parents=True, exist_ok=True)
artists = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {artistCatalog} from './dist/artists.js'; console.log(JSON.stringify(artistCatalog))"], cwd=root, text=True, encoding='utf-8'))
module = root / 'dist/music-art.js'
existing = json.loads(module.read_text(encoding='utf-8').split('export const musicArt=', 1)[1].rstrip().rstrip(';')) if module.exists() else {}
def normal(value):
    return ' '.join(unicodedata.normalize('NFKC', value).strip().lower().split())
def fetch(artist):
    if normal(artist) in existing:
        return artist, existing[normal(artist)]
    try:
        url = 'https://itunes.apple.com/search?' + urllib.parse.urlencode({'term': artist, 'entity': 'album', 'limit': 60, 'country': 'US'})
        with urllib.request.urlopen(url, timeout=30) as response:
            records = json.load(response)['results']
        records = [r for r in records if normal(r.get('artistName', '')) == normal(artist) and r.get('artworkUrl100')]
        if not records:
            return artist, None
        album = records[0]
        slug = re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', artist).encode('ascii', 'ignore').decode().lower()).strip('-')
        image = album['artworkUrl100'].replace('100x100bb', '400x400bb')
        with urllib.request.urlopen(image, timeout=30) as response:
            image_bytes = response.read()
        (target / (slug + '.jpg')).write_bytes(image_bytes)
        return artist, {'artist': artist, 'title': album['collectionName'], 'art': 'assets/covers/' + slug + '.jpg', 'url': album['collectionViewUrl']}
    except Exception as error:
        print('ERROR', artist, str(error), flush=True)
        return artist, None

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(fetch, artists))
for index, (artist, value) in enumerate(results):
    if value is None:
        time.sleep(4)
        results[index] = fetch(artist)
art = {normal(name): value for name, value in results if value}
(root / 'dist/music-art.js').write_text('// Album covers from the Apple iTunes catalog. See each entry for its source.\nexport const musicArt=' + json.dumps(art, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
print(json.dumps({'downloaded': len(art), 'missing': [name for name, value in results if not value]}, ensure_ascii=False), flush=True)
