/**
 * One-time script: downloads a corpus of real master/strong-player games and
 * writes a trimmed PGN bundle to src/data/master-games/games.pgn.
 *
 * Source: Lichess Elite Database (https://database.nikonoel.fr/) — games filtered
 * to strong players (2500+ vs 2300+). The underlying Lichess open database is
 * CC0, so this corpus is freely redistributable / bundleable.
 *
 * The monthly files are ~100 MB zips holding a single large .pgn. We stream the
 * zip through fflate's streaming Unzip and stop as soon as we have MAX_GAMES
 * kept games, so the full (~500 MB+) decompressed PGN never lands in memory or
 * on disk — only the trimmed output is written.
 *
 * Run: node scripts/download-master-games.mjs [YYYY-MM]
 */
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Unzip, UnzipInflate } from 'fflate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'src', 'data', 'master-games');

// Month to pull (override via argv). Earliest available is 2020-06.
const MONTH     = process.argv[2] || '2020-06';
const SOURCE_URL = `https://database.nikonoel.fr/lichess_elite_${MONTH}.zip`;

const MAX_GAMES = Number(process.argv[3]) || 4000;
const MIN_PLIES = 12;                       // skip games too short to drill
const RESULTS   = new Set(['1-0', '0-1', '1/2-1/2']); // drop unterminated (*)

/** Light header/length filter — full parsing happens at server load time. */
function shouldKeep(gamePgn) {
  const resultMatch = gamePgn.match(/\[Result\s+"([^"]+)"\]/);
  if (!resultMatch || !RESULTS.has(resultMatch[1])) return false;
  // Movetext is everything after the blank line following the headers.
  const blank = gamePgn.indexOf('\n\n');
  const movetext = blank === -1 ? '' : gamePgn.slice(blank + 2);
  // Rough ply count: SAN tokens that aren't move numbers / results.
  const tokens = movetext
    .replace(/\{[^}]*\}/g, ' ')             // strip comments
    .replace(/\d+\.(\.\.)?/g, ' ')          // strip move numbers
    .trim()
    .split(/\s+/)
    .filter(t => t && !RESULTS.has(t) && t !== '*');
  return tokens.length >= MIN_PLIES;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Fetching ${SOURCE_URL} …`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${SOURCE_URL}`);

  const kept = [];
  let pending = '';
  let done = false;
  const decoder = new TextDecoder();

  // Pull complete games out of the `pending` buffer. Games are separated by a
  // blank line preceding the next "[Event " tag.
  const drain = (finalFlush) => {
    for (;;) {
      const idx = pending.indexOf('\n\n[Event ', 1);
      if (idx === -1) break;
      const game = pending.slice(0, idx).trim();
      pending = pending.slice(idx + 2);     // keep from the next "[Event "
      if (game && shouldKeep(game)) kept.push(game);
      if (kept.length >= MAX_GAMES) { done = true; return; }
    }
    if (finalFlush && !done) {
      const game = pending.trim();
      if (game && shouldKeep(game)) kept.push(game);
    }
  };

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (!file.name.toLowerCase().endsWith('.pgn')) return;
    file.ondata = (err, chunk, final) => {
      if (err) throw err;
      if (done) return;                     // already have enough — ignore the rest
      pending += decoder.decode(chunk, { stream: !final });
      drain(final);
    };
    file.start();
  };

  const reader = res.body.getReader();
  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (value) unzip.push(value, streamDone);
    if (streamDone) { if (!done) drain(true); break; }
  }
  try { reader.cancel(); } catch { /* stream may already be closed */ }

  if (kept.length === 0) throw new Error('No games extracted — check the source format.');

  const outPath = join(OUT_DIR, 'games.pgn');
  await writeFile(outPath, kept.join('\n\n') + '\n', 'utf8');

  const manifest = {
    source: SOURCE_URL,
    license: 'CC0 1.0 (Lichess open database)',
    month: MONTH,
    gameCount: kept.length,
    // NOTE: pulledAt intentionally omitted (no Date in deterministic contexts);
    // fill manually if provenance timestamp is needed.
  };
  await writeFile(join(OUT_DIR, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`  ✓ saved ${outPath}  (${kept.length} games)`);
  console.log(`  ✓ saved ${join(OUT_DIR, 'MANIFEST.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
