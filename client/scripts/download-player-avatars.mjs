/**
 * Downloads portrait photos for the legendary players from Wikipedia and saves
 * them to src/assets/players/<key>.<ext> so they can be bundled as avatars.
 *
 * Images come from Wikimedia Commons (public-domain for historical players,
 * CC-BY-SA for modern ones). Run: node scripts/download-player-avatars.mjs
 */
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'assets', 'players');

// local key -> Wikipedia page title
const PLAYERS = {
  paul_morphy:    'Paul Morphy',
  steinitz:       'Wilhelm Steinitz',
  emanuel_lasker: 'Emanuel Lasker',
  capablanca:     'José Raúl Capablanca',
  alekhine:       'Alexander Alekhine',
  euwe:           'Max Euwe',
  botvinnik:      'Mikhail Botvinnik',
  smyslov:        'Vasily Smyslov',
  mikhail_tal:    'Mikhail Tal',
  petrosian:      'Tigran Petrosian',
  spassky:        'Boris Spassky',
  fischer:        'Bobby Fischer',
  karpov:         'Anatoly Karpov',
  kasparov:       'Garry Kasparov',
  kramnik:        'Vladimir Kramnik',
  anand:          'Viswanathan Anand',
  carlsen:        'Magnus Carlsen',
};

const TARGET_WIDTH = 480;

const UA = 'Mozilla/5.0 (compatible; chess-training-avatars/1.0)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchRetry(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * (i + 1)); continue; }
    return res; // non-retryable (e.g. 400/404)
  }
  return null;
}

async function summary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetchRetry(url);
  if (!res || !res.ok) throw new Error(`summary HTTP ${res ? res.status : 'retry-exhausted'}`);
  return res.json();
}

// Upscale a Wikimedia thumbnail URL to TARGET_WIDTH (keeps file small vs original).
function widen(thumbUrl) {
  return thumbUrl.replace(/\/(\d+)px-/, `/${TARGET_WIDTH}px-`);
}

async function downloadOne(key, title) {
  const data = await summary(title);
  const thumb = data?.thumbnail?.source;
  const orig = data?.originalimage?.source;
  // Wikimedia rejects (400) thumbnails wider than the source, so prefer the
  // ready-made thumbnail as-is; only fall back to the full image.
  const candidates = [thumb, orig].filter(Boolean);

  for (const src of candidates) {
    const res = await fetchRetry(src);
    if (!res || !res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (src.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4) || 'jpg';
    const dest = join(OUT_DIR, `${key}.${ext}`);
    await writeFile(dest, buf);
    console.log(`  ✓ ${title} -> ${key}.${ext} (${Math.round(buf.length / 1024)} KB)`);
    return;
  }
  console.warn(`  ✗ ${title}: all image candidates failed`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log('Downloading player avatars from Wikipedia…');
  for (const [key, title] of Object.entries(PLAYERS)) {
    try { await downloadOne(key, title); }
    catch (err) { console.warn(`  ✗ ${title}: ${err.message}`); }
    await sleep(700); // be polite to Wikimedia (avoid 429)
  }
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
