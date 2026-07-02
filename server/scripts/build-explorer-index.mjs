/**
 * Build-time generation of the master-games explorer index.
 *
 * Parsing the whole PGN corpus with chess.js to build the position index takes
 * 20-60s of CPU. Doing that on every server cold start is exactly what makes the
 * free Render tier feel slow. Instead we run it ONCE here at build time and write
 * the result to a JSON artifact next to the PGN files; at runtime the server just
 * loads that file (fast). See `buildExplorerIndexToFile` in data/masterGames.ts.
 *
 * Runs after `tsc` + copy-assets so it can import the compiled module and write
 * into the same data directory the runtime resolves (dist/data/master-games).
 */
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compiled = join(__dirname, '..', 'dist', 'data', 'masterGames.js');

async function main() {
  const mod = await import(pathToFileURL(compiled).href);
  if (typeof mod.buildExplorerIndexToFile !== 'function') {
    throw new Error('buildExplorerIndexToFile not found — did `tsc` run first?');
  }
  console.log('Building explorer index (this parses the full corpus once)…');
  const started = Date.now();
  const outPath = await mod.buildExplorerIndexToFile();
  console.log(`  ✓ wrote ${outPath} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch(err => { console.error('Explorer index build failed:', err); process.exit(1); });
