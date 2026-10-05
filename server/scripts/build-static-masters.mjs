/**
 * Build-time export of the master-games collection lists as static JSON for
 * the client (served by the static site, so /masters/players and the opening
 * games browser never wait on a sleeping Render API).
 *
 * Imports the compiled `dist/data/masterGames.js` so game ids come from the
 * server's own hashing/dedupe — they stay valid for `/api/master-games/:id`.
 *
 * Writes into client/public/data/masters/:
 *   collections.json   – Collection[] (same as GET /api/master-games/collections)
 *   games/<key>.json   – compact rows, in source (file) order:
 *                        [id, white, black, whiteElo, blackElo, event, date, result, eco, opening, plies]
 *
 * Run: `pnpm build:static-data` (tsc + copy-assets + this script). Commit the
 * output — the client static build does not build the server.
 */
import { mkdir, rm, writeFile, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compiled = join(__dirname, '..', 'dist', 'data', 'masterGames.js');
const OUT_DIR = join(__dirname, '..', '..', 'client', 'public', 'data', 'masters');

async function main() {
  const mod = await import(pathToFileURL(compiled).href);
  if (typeof mod.getCollections !== 'function') {
    throw new Error('getCollections not found — did `tsc` run first?');
  }

  const collections = mod.getCollections();
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(join(OUT_DIR, 'games'), { recursive: true });
  await writeFile(join(OUT_DIR, 'collections.json'), JSON.stringify(collections));

  let totalBytes = 0;
  for (const c of collections) {
    // An unknown sort key falls back to the collection's original (file) order,
    // which is what the server's stable sorts start from — exporting that order
    // lets the client reproduce identical tie-breaking for every sort.
    const { games } = mod.getGamesByCollection(c.key, {
      sortBy: 'source', sortDir: 'order', page: 1, pageSize: Number.MAX_SAFE_INTEGER,
    });
    const rows = games.map(g => [
      g.id, g.white, g.black, g.whiteElo, g.blackElo, g.event, g.date, g.result, g.eco, g.opening, g.plies,
    ]);
    const file = join(OUT_DIR, 'games', `${c.key}.json`);
    await writeFile(file, JSON.stringify(rows));
    totalBytes += (await stat(file)).size;
  }

  console.log(
    `  ✓ wrote ${collections.length} collections → ${OUT_DIR} (${(totalBytes / 1024 / 1024).toFixed(1)} MB raw)`,
  );
}

main().catch(err => { console.error('Static masters export failed:', err); process.exit(1); });
