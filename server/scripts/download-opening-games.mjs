/**
 * Downloads opening game collections from PGN Mentor (https://www.pgnmentor.com/openings/)
 * and writes a capped, evenly-sampled set of each as
 *   src/data/master-games/opening_<key>.pgn
 * plus a classification manifest the server reads:
 *   src/data/master-games/openings.manifest.json  ({ key: { label, group, popular } })
 *
 * These feed the "Practice by Opening" browser under /repertoire. The drill,
 * review and games-list all reuse the existing master-games pipeline.
 *
 * Only games between titled players are kept: BOTH sides must have a numeric
 * rating >= MIN_ELO (default 2500 = Grandmaster). Unrated/lower games are dropped.
 *
 *   --skip-existing  leave openings whose file already exists untouched
 *   --min-elo=N      minimum rating for BOTH players (default 2500)
 *   [maxGames]       cap each opening to N evenly-sampled games (default: 150)
 *
 * Run: node scripts/download-opening-games.mjs [--skip-existing] [--min-elo=2500] [maxGames]
 */
import { mkdir, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { unzipSync } from 'fflate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data', 'master-games');
const BASE = 'https://www.pgnmentor.com/openings';

const args = process.argv.slice(2);
const SKIP_EXISTING = args.includes('--skip-existing');
const capArg = args.find(a => /^\d+$/.test(a));
const MAX_GAMES = capArg ? Number(capArg) : 150;
const MIN_PLIES = 12;
const minEloArg = args.find(a => a.startsWith('--min-elo='));
const MIN_ELO = minEloArg ? Number(minEloArg.split('=')[1]) : 2500; // 2500 = Grandmaster
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);

// Curated PGN Mentor opening files (filenames verified to exist), classified by
// first move (group) with a "popular" flag for the Most-Popular filter.
const OPENINGS = [
  // ── King Pawn (1.e4) ──
  { file: 'SicilianNajdorf6Bg5', key: 'sicilian-najdorf',    label: 'Sicilian Defense: Najdorf', group: 'e4', popular: true },
  { file: 'SicilianScheveningen', key: 'sicilian-scheveningen', label: 'Sicilian Defense: Scheveningen', group: 'e4', popular: false },
  { file: 'FrenchAdvance',       key: 'french-advance',      label: 'French Defense: Advance',   group: 'e4', popular: true },
  { file: 'Caro-KannAdv',        key: 'caro-kann-advance',   label: 'Caro-Kann Defense: Advance', group: 'e4', popular: true },
  { file: 'RuyLopezChigorin',    key: 'ruy-lopez-chigorin',  label: 'Ruy Lopez: Chigorin',       group: 'e4', popular: true },
  { file: 'RuyLopezBerlin',      key: 'ruy-lopez-berlin',    label: 'Ruy Lopez: Berlin Defense', group: 'e4', popular: true },
  { file: 'TwoKnights',          key: 'italian-two-knights', label: 'Italian Game: Two Knights', group: 'e4', popular: true },
  { file: 'PetroffMain',         key: 'petroff',             label: 'Petrov Defense',            group: 'e4', popular: false },
  { file: 'KingsGambit',         key: 'kings-gambit',        label: "King's Gambit",             group: 'e4', popular: false },
  // ── Queen Pawn (1.d4) ──
  { file: 'QGDExchange',         key: 'qgd-exchange',        label: "Queen's Gambit Declined: Exchange", group: 'd4', popular: true },
  { file: 'QGAMain',             key: 'queens-gambit-accepted', label: "Queen's Gambit Accepted", group: 'd4', popular: true },
  { file: 'SlavMain',            key: 'slav',                label: 'Slav Defense',              group: 'd4', popular: true },
  { file: 'SemiSlavMeran',       key: 'semi-slav-meran',     label: 'Semi-Slav Defense: Meran',  group: 'd4', popular: false },
  { file: 'KIDClassical',        key: 'kings-indian-classical', label: "King's Indian Defense: Classical", group: 'd4', popular: true },
  { file: 'GrunfeldExchange',    key: 'grunfeld-exchange',   label: 'Grünfeld Defense: Exchange', group: 'd4', popular: true },
  { file: 'BenkoGambit',         key: 'benko-gambit',        label: 'Benko Gambit',              group: 'd4', popular: false },
  { file: 'London2e6',           key: 'london-system',       label: 'London System',             group: 'd4', popular: true },
  { file: 'CatalanClosed',       key: 'catalan-closed',      label: 'Catalan: Closed',           group: 'd4', popular: false },
  // ── Other (flank / 1.c4 / 1.Nf3) ──
  { file: 'EnglishSymMain',      key: 'english-symmetrical', label: 'English: Symmetrical',      group: 'other', popular: true },
  { file: 'English1c6',          key: 'english-caro-kann',   label: 'English: 1...c6',           group: 'other', popular: false },
  { file: 'RetiKIA',             key: 'reti-kia',            label: 'Réti / King\'s Indian Attack', group: 'other', popular: false },
  { file: 'Bird',                key: 'bird',                label: "Bird's Opening",            group: 'other', popular: false },
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

function elo(gamePgn, tag) {
  const m = gamePgn.match(new RegExp(`\\[${tag}\\s+"(\\d+)"\\]`));
  return m ? parseInt(m[1], 10) : null;
}

function shouldKeep(gamePgn) {
  const m = gamePgn.match(/\[Result\s+"([^"]+)"\]/);
  if (!m || !RESULTS.has(m[1])) return false;
  // Both players must be at least Grandmaster level.
  const we = elo(gamePgn, 'WhiteElo');
  const be = elo(gamePgn, 'BlackElo');
  if (we === null || be === null || we < MIN_ELO || be < MIN_ELO) return false;
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

async function downloadOpening(o, manifest) {
  const dest = join(OUT_DIR, `opening_${o.key}.pgn`);
  if (SKIP_EXISTING && await fileExists(dest)) {
    console.log(`  • ${o.label}: already present (skipped)`);
    manifest[o.key] = { label: o.label, group: o.group, popular: o.popular };
    return;
  }
  const url = `${BASE}/${o.file}.zip`;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`  ✗ ${o.label} (${o.file}): HTTP ${res.status}`); return; }
  const buf = new Uint8Array(await res.arrayBuffer());

  const files = unzipSync(buf);
  const pgnName = Object.keys(files).find(n => n.toLowerCase().endsWith('.pgn'));
  if (!pgnName) { console.warn(`  ✗ ${o.label}: no .pgn in zip`); return; }

  const text = new TextDecoder().decode(files[pgnName]);
  const kept = splitGames(text).filter(shouldKeep);
  const chosen = sample(kept, MAX_GAMES);

  await writeFile(dest, chosen.join('\n\n') + '\n', 'utf8');
  manifest[o.key] = { label: o.label, group: o.group, popular: o.popular };
  console.log(`  ✓ ${o.label}: ${chosen.length}/${kept.length} games -> opening_${o.key}.pgn`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Downloading opening collections (max ${MAX_GAMES}/opening, both players ≥ ${MIN_ELO} Elo${SKIP_EXISTING ? ', skip existing' : ', overwrite'})…`);
  const manifest = {};
  for (const o of OPENINGS) {
    try { await downloadOpening(o, manifest); }
    catch (err) { console.warn(`  ✗ ${o.label}: ${err.message}`); }
  }
  await writeFile(join(OUT_DIR, 'openings.manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Wrote openings.manifest.json (${Object.keys(manifest).length} openings). Done.`);
}

main().catch(err => { console.error(err); process.exit(1); });
