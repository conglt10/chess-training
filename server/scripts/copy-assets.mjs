/**
 * Post-build asset copy: `tsc` only emits .js, so the runtime data and the
 * built client are not in `dist/`. This makes `dist/` fully self-contained so
 * `node dist/index.js` runs standalone (and the Electron build can ship just
 * `server/dist`).
 *
 * Copies into dist/:
 *   src/data/tsv          -> dist/data/tsv          (opening book)
 *   src/data/master-games -> dist/data/master-games (PGN corpus + manifests)
 *   ../client/dist        -> dist/public            (built React client)
 *
 * Run automatically by `npm run build` (after tsc). The client copy is skipped
 * with a warning if client/dist doesn't exist yet (build the client first).
 */
import { cp, access, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const SRC_DATA = join(SERVER_DIR, 'src', 'data');
const DIST = join(SERVER_DIR, 'dist');
const CLIENT_DIST = join(SERVER_DIR, '..', 'client', 'dist');

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function copyDir(from, to, label) {
  if (!(await exists(from))) {
    console.warn(`  ⚠ ${label}: source not found (${from}) — skipped`);
    return;
  }
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
  console.log(`  ✓ ${label}: ${from} -> ${to}`);
}

async function main() {
  console.log('Copying runtime assets into dist/…');
  await copyDir(join(SRC_DATA, 'tsv'), join(DIST, 'data', 'tsv'), 'opening book (tsv)');
  await copyDir(join(SRC_DATA, 'master-games'), join(DIST, 'data', 'master-games'), 'master games (pgn)');
  await copyDir(CLIENT_DIST, join(DIST, 'public'), 'client build');
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
