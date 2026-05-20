/**
 * One-time script: downloads the 5 Lichess opening TSV files to src/data/tsv/
 * Run: node scripts/download-tsv.mjs
 */
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'src', 'data', 'tsv');
const BASE_URL  = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';
const FILES     = ['a', 'b', 'c', 'd', 'e'];

await mkdir(OUT_DIR, { recursive: true });

for (const f of FILES) {
  const url = `${BASE_URL}/${f}.tsv`;
  console.log(`Fetching ${url} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  const dest = join(OUT_DIR, `${f}.tsv`);
  await writeFile(dest, text, 'utf8');
  const lines = text.split('\n').filter(l => l.trim()).length;
  console.log(`  ✓ saved ${dest}  (${lines} lines)`);
}

console.log('\nAll TSV files downloaded successfully.');
