/**
 * build-openings-json.mjs
 *
 * Generates `client/public/data/openings.json` from the server's TSV opening
 * book (`server/src/data/tsv/{a,b,c,d,e}.tsv`) so the frontend-only Game
 * Review can identify openings (ECO + book filtering) without a backend call.
 *
 * Run: `node scripts/build-openings-json.mjs` (from client/)
 * Or:   `pnpm build:review-data`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const TSV_DIR = path.resolve(here, '../../server/src/data/tsv');
const OUT_FILE = path.resolve(here, '../public/data/openings.json');

function parsePgnToMoves(pgn) {
  return pgn
    .replace(/\d+\.\s*/g, '')
    .trim()
    .split(/\s+/)
    .filter((m) => m.length > 0);
}

function extractFamily(name) {
  if (name.includes('London System')) return 'London System';
  let family = name.split(':')[0].trim();
  if (family.endsWith(' Accepted')) family = family.replace(' Accepted', '');
  else if (family.endsWith(' Declined')) family = family.replace(' Declined', '');
  return family;
}

const files = ['a', 'b', 'c', 'd', 'e'];
const openings = [];

for (const file of files) {
  const filePath = path.join(TSV_DIR, `${file}.tsv`);
  if (!fs.existsSync(filePath)) {
    console.warn(`[build-openings-json] missing: ${filePath} (skipping)`);
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.trim() || line.startsWith('eco\t')) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [eco, name, pgn] = parts;
    const moves = parsePgnToMoves(pgn);
    if (moves.length === 0) continue;
    openings.push({
      eco: eco.trim(),
      name: name.trim(),
      family: extractFamily(name.trim()),
      moves,
    });
  }
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(openings));
const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
console.log(`[build-openings-json] wrote ${openings.length} openings → ${OUT_FILE} (${kb} KB)`);
