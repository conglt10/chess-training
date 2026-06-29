/**
 * Downloads career game collections for the world chess champions (and a few
 * other legends) from PGN Mentor (https://www.pgnmentor.com/players/), and
 * writes each player's FULL collection as
 *   src/data/master-games/master_games_<key>.pgn
 * matching the existing per-player file naming.
 *
 * By default it downloads the complete collection for every player and
 * OVERWRITES existing files (so small placeholder files get the full set).
 *   --skip-existing  leave players whose file already exists untouched
 *   [maxGames]       cap each player to an evenly-sampled N games (default: all)
 *
 * Run: node scripts/download-legend-games.mjs [--skip-existing] [maxGames]
 */
import { mkdir, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { unzipSync } from 'fflate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data', 'master-games');
const BASE = 'https://www.pgnmentor.com/players';

const args = process.argv.slice(2);
const SKIP_EXISTING = args.includes('--skip-existing');
// No cap by default — download the full collection. Optional numeric arg caps it.
const capArg = args.find(a => /^\d+$/.test(a));
const MAX_GAMES = capArg ? Number(capArg) : Infinity;
const MIN_PLIES = 12;
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);

// PGN Mentor file name -> desired local key (keys reuse the user's existing
// filenames so those collections are matched and skipped, not duplicated).
const CHAMPIONS = [
  { mentor: 'Morphy',     key: 'paul_morphy' },
  { mentor: 'Steinitz',   key: 'steinitz' },
  { mentor: 'Lasker',     key: 'emanuel_lasker' },
  { mentor: 'Capablanca', key: 'capablanca' },
  { mentor: 'Alekhine',   key: 'alekhine' },
  { mentor: 'Euwe',       key: 'euwe' },
  { mentor: 'Botvinnik',  key: 'botvinnik' },
  { mentor: 'Smyslov',    key: 'smyslov' },
  { mentor: 'Tal',        key: 'mikhail_tal' },
  { mentor: 'Petrosian',  key: 'petrosian' },
  { mentor: 'Spassky',    key: 'spassky' },
  { mentor: 'Fischer',    key: 'fischer' },
  { mentor: 'Karpov',     key: 'karpov' },
  { mentor: 'Kasparov',   key: 'kasparov' },
  { mentor: 'Kramnik',    key: 'kramnik' },
  { mentor: 'Anand',      key: 'anand' },
  { mentor: 'Carlsen',    key: 'carlsen' },
];

function splitGames(pgnText) {
  const games = [];
  let rest = pgnText.replace(/\r\n/g, '\n').trim();
  while (rest.length > 0) {
    const idx = rest.indexOf('\n\n[Event ', 1);
    if (idx === -1) { games.push(rest.trim()); break; }
    games.push(rest.slice(0, idx).trim());
    rest = rest.slice(idx + 2);
  }
  return games.filter(Boolean);
}

function shouldKeep(gamePgn) {
  const m = gamePgn.match(/\[Result\s+"([^"]+)"\]/);
  if (!m || !RESULTS.has(m[1])) return false;
  const blank = gamePgn.indexOf('\n\n');
  const movetext = blank === -1 ? '' : gamePgn.slice(blank + 2);
  const tokens = movetext
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t => t && !RESULTS.has(t) && t !== '*');
  return tokens.length >= MIN_PLIES;
}

// Evenly sample up to `max` items across the full list (career spread).
function sample(items, max) {
  if (items.length <= max) return items;
  const stride = items.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(items[Math.floor(i * stride)]);
  return out;
}

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function downloadPlayer({ mentor, key }) {
  const dest = join(OUT_DIR, `master_games_${key}.pgn`);
  if (SKIP_EXISTING && await fileExists(dest)) {
    console.log(`  • ${mentor}: already present (skipped)`);
    return;
  }
  const url = `${BASE}/${mentor}.zip`;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`  ✗ ${mentor}: HTTP ${res.status}`); return; }
  const buf = new Uint8Array(await res.arrayBuffer());

  const files = unzipSync(buf);
  const pgnName = Object.keys(files).find(n => n.toLowerCase().endsWith('.pgn'));
  if (!pgnName) { console.warn(`  ✗ ${mentor}: no .pgn in zip`); return; }

  const text = new TextDecoder().decode(files[pgnName]);
  const kept = splitGames(text).filter(shouldKeep);
  const chosen = sample(kept, MAX_GAMES);

  await writeFile(dest, chosen.join('\n\n') + '\n', 'utf8');
  console.log(`  ✓ ${mentor}: ${chosen.length}/${kept.length} games -> master_games_${key}.pgn`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const cap = MAX_GAMES === Infinity ? 'all games' : `max ${MAX_GAMES}/player`;
  console.log(`Downloading legend collections (${cap}${SKIP_EXISTING ? ', skip existing' : ', overwrite'})…`);
  for (const champ of CHAMPIONS) {
    try { await downloadPlayer(champ); }
    catch (err) { console.warn(`  ✗ ${champ.mentor}: ${err.message}`); }
  }
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
