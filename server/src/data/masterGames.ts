import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Chess } from 'chess.js';
import {
  MasterGame,
  MasterGameSummary,
  MoveStat,
  ExplorerResult,
  GameResult,
  Collection,
} from '../types';
import { getAllOpenings } from './openings';

// Local PGN corpus — populated by `npm run download-master-games`
// (Lichess Elite) and `npm run download-legend-games` (per-champion files).
const DATA_DIR = (() => {
  const p1 = path.join(__dirname, 'master-games');
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(__dirname, '..', '..', 'src', 'data', 'master-games');
  if (fs.existsSync(p2)) return p2;
  const p3 = path.join(process.cwd(), 'src', 'data', 'master-games');
  if (fs.existsSync(p3)) return p3;
  return p1; // default fallback
})();

// How deep into each game we index positions (plies = half-moves).
// 40 plies = 20 moves per side, plenty for an opening explorer.
const INDEX_PLIES = 40;
const MIN_PLIES = 12;
const ELITE_KEY = 'lichess-elite';

// A game with its header metadata extracted cheaply. The raw PGN text is NOT
// retained (that would be ~30 MB across the corpus); instead we keep a light
// reference — the source file plus the game's index within that file — so the
// full movetext can be re-read from disk on demand (drill). This keeps the
// resident metadata cache small, which matters on Render's memory-limited tier.
type RawGame = MasterGameSummary & {
  _file: string;
  _idx: number;
  /** Lowercased "white black event opening eco year" — precomputed once so per-request search never rebuilds strings. */
  _hay: string;
};

// ── In-memory caches ───────────────────────────────────────────────────────
// Cheap header-only metadata (built at startup):
let metaLoaded = false;
let rawById: Map<string, RawGame> | null = null;
let rawByCollection: Map<string, RawGame[]> | null = null;
let collections: Collection[] | null = null;

// Lazily-populated cache of a file's split game strings, filled only when a
// game from that file is actually parsed (drill / live index build). Typical
// usage touches few files, so this stays far smaller than the whole corpus.
const fileGamesCache = new Map<string, string[]>();

function readGamesFromFile(file: string): string[] {
  const hit = fileGamesCache.get(file);
  if (hit) return hit;
  // Normalize line endings — some hand-downloaded files use CRLF.
  const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8').replace(/\r\n/g, '\n');
  const games = splitGames(content);
  fileGamesCache.set(file, games);
  return games;
}

/** Re-read the raw PGN text for a game from its source file. */
function loadPgnForRaw(raw: RawGame): string | null {
  const games = readGamesFromFile(raw._file);
  return games[raw._idx] ?? null;
}

// Fully-parsed games (moves + uci), parsed lazily on demand and cached:
const parsedById = new Map<string, MasterGame>();

// Explorer position index (built lazily on first explorer request):
interface PositionEntry {
  moves: Map<string, MoveStat>; // keyed by uci
  gameIds: string[];            // distinct games reaching this position
}
let positionIndex: Map<string, PositionEntry> | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Position identity: placement + turn + castling + en-passant (drop clocks). */
function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

function toNum(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

const VALID_RESULTS = new Set<GameResult>(['1-0', '0-1', '1/2-1/2']);

/** Split a multi-game PGN string into individual game strings. */
function splitGames(pgnText: string): string[] {
  const games: string[] = [];
  let rest = pgnText.trim();
  while (rest.length > 0) {
    const idx = rest.indexOf('\n\n[Event ', 1);
    if (idx === -1) { games.push(rest.trim()); break; }
    games.push(rest.slice(0, idx).trim());
    rest = rest.slice(idx + 2);
  }
  return games.filter(g => g.length > 0);
}

/** Header tags we actually index — parsed in a single pass over the header section. */
interface GameHeaders {
  white: string; black: string; whiteElo: string; blackElo: string;
  event: string; date: string; result: string; eco: string; opening: string;
}

/**
 * Parse the PGN header section (everything before the blank line) in one pass.
 * The old code ran one full-text RegExp per tag (~9 scans of the whole game,
 * including the movetext); this scans the headers once and never touches the
 * movetext, which is the bulk of the bytes.
 */
function parseHeaders(pgn: string, headerEnd: number): GameHeaders {
  const h: GameHeaders = {
    white: '', black: '', whiteElo: '', blackElo: '',
    event: '', date: '', result: '', eco: '', opening: '',
  };
  const section = headerEnd === -1 ? pgn : pgn.slice(0, headerEnd);
  let i = 0;
  while (i < section.length) {
    const open = section.indexOf('[', i);
    if (open === -1) break;
    const sp = section.indexOf(' ', open + 1);
    if (sp === -1) break;
    const tag = section.slice(open + 1, sp);
    const q1 = section.indexOf('"', sp + 1);
    if (q1 === -1) break;
    const q2 = section.indexOf('"', q1 + 1);
    if (q2 === -1) break;
    const value = section.slice(q1 + 1, q2);
    switch (tag) {
      case 'White': h.white = value; break;
      case 'Black': h.black = value; break;
      case 'WhiteElo': h.whiteElo = value; break;
      case 'BlackElo': h.blackElo = value; break;
      case 'Event': h.event = value; break;
      case 'Date': h.date = value; break;
      case 'Result': h.result = value; break;
      case 'ECO': h.eco = value; break;
      case 'Opening': h.opening = value; break;
    }
    i = q2 + 1;
  }
  return h;
}

/**
 * Single-pass ply counter over movetext (no chess.js, no intermediate strings).
 * Skips `{...}` comments, move numbers (`12.` / `12...`, incl. glued `12.e4`),
 * game results and `*`. Castling written as `0-0` is counted as a move.
 */
function countPliesFast(movetext: string): number {
  let count = 0;
  let i = 0;
  const n = movetext.length;
  while (i < n) {
    const c = movetext[i];
    // Skip comments wholesale (they may contain spaces).
    if (c === '{') {
      const end = movetext.indexOf('}', i + 1);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { i++; continue; }
    let j = i + 1;
    while (j < n) {
      const d = movetext[j];
      if (d === ' ' || d === '\n' || d === '\t' || d === '\r' || d === '{') break;
      j++;
    }
    const tok = movetext.slice(i, j);
    i = j;
    if (tok === '*' || VALID_RESULTS.has(tok as GameResult)) continue;
    // Move number? Leading digits followed by a dot.
    let k = 0;
    while (k < tok.length && tok[k] >= '0' && tok[k] <= '9') k++;
    if (k > 0 && k < tok.length && tok[k] === '.') {
      const rest = tok.slice(k + 1);
      // Pure move number ("12.", "12...", "12. ...") → skip; glued move
      // ("12.e4") → the remainder is one real move.
      if (rest === '' || rest[0] === '.') continue;
      count++;
      continue;
    }
    count++;
  }
  return count;
}

// Opening-collection classification, written by `npm run download-opening-games`.
interface OpeningManifestEntry { label: string; group: 'e4' | 'd4' | 'other'; popular: boolean }
let openingsManifest: Record<string, OpeningManifestEntry> | null = null;
function getOpeningsManifest(): Record<string, OpeningManifestEntry> {
  if (openingsManifest) return openingsManifest;
  try {
    const p = path.join(DATA_DIR, 'openings.manifest.json');
    openingsManifest = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : {};
  } catch { openingsManifest = {}; }
  return openingsManifest!;
}

function titleCase(base: string): string {
  return base.split('_').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Derive a collection key + human label from a PGN filename.
function collectionFromFile(file: string): { key: string; label: string } {
  if (file === 'games.pgn') return { key: ELITE_KEY, label: 'Lichess Elite (2500+)' };
  if (file.startsWith('opening_')) {
    const key = file.replace(/\.pgn$/i, '').replace(/^opening_/, '');
    return { key, label: getOpeningsManifest()[key]?.label ?? titleCase(key) };
  }
  const base = file.replace(/\.pgn$/i, '').replace(/^master_games_/, '');
  return { key: base, label: titleCase(base) || base };
}

function rawToSummary(raw: RawGame): MasterGameSummary {
  const { _file, _idx, ...summary } = raw;
  return summary;
}

// ECO code -> broad opening family (e.g. "B90" -> "Sicilian Defense"), built
// once from the openings dataset so legend games that carry only an ECO code
// are still searchable/displayable by opening name.
let ecoToOpening: Map<string, string> | null = null;
function getEcoToOpening(): Map<string, string> {
  if (ecoToOpening) return ecoToOpening;
  const map = new Map<string, string>();
  try {
    for (const o of getAllOpenings()) {
      if (o.eco && !map.has(o.eco)) map.set(o.eco, o.family);
    }
  } catch { /* openings not available — leave map empty */ }
  ecoToOpening = map;
  return map;
}

// ── Cheap metadata load (startup) ────────────────────────────────────────────

function ensureMetadata(): void {
  if (metaLoaded) return;
  metaLoaded = true;
  rawById = new Map();
  rawByCollection = new Map();

  if (!fs.existsSync(DATA_DIR)) {
    console.warn(`[master-games] Data dir not found: ${DATA_DIR}`);
    console.warn('[master-games] Run `npm run download-master-games` / `download-legend-games`.');
    collections = [];
    sortedByCollection = new Map();
    return;
  }

  // games.pgn (Elite) first, then players A→Z.
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.toLowerCase().endsWith('.pgn'))
    .sort((a, b) => (a === 'games.pgn' ? -1 : b === 'games.pgn' ? 1 : a.localeCompare(b)));

  const labels = new Map<string, string>();
  const ecoMap = getEcoToOpening();

  for (const file of files) {
    const { key, label } = collectionFromFile(file);
    labels.set(key, label);
    // Normalize line endings — some hand-downloaded files use CRLF.
    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8').replace(/\r\n/g, '\n');
    // `_idx` indexes into this same split array, so a later on-demand read via
    // readGamesFromFile() (which uses the identical transform) lines up exactly.
    const gamesInFile = splitGames(content);
    for (let idx = 0; idx < gamesInFile.length; idx++) {
      const pgn = gamesInFile[idx];
      const blank = pgn.indexOf('\n\n');
      const h = parseHeaders(pgn, blank);
      const result = (h.result || '*') as GameResult;
      if (!VALID_RESULTS.has(result)) continue;
      const plies = countPliesFast(blank === -1 ? '' : pgn.slice(blank + 2));
      if (plies < MIN_PLIES) continue;

      const date = h.date;
      const eco = h.eco;
      let id = crypto.createHash('sha1').update(pgn).digest('hex').slice(0, 12);
      let n = 1;
      while (rawById!.has(id)) id = `${id}-${n++}`;

      const white = h.white || 'Unknown';
      const black = h.black || 'Unknown';
      const event = h.event;
      const opening = h.opening || ecoMap.get(eco) || '';
      const year = toNum(date.slice(0, 4));
      const raw: RawGame = {
        id,
        white,
        black,
        whiteElo: toNum(h.whiteElo),
        blackElo: toNum(h.blackElo),
        event,
        date,
        year,
        result,
        eco,
        opening,
        plies,
        collectionKey: key,
        collection: label,
        _file: file,
        _idx: idx,
        _hay: `${white} ${black} ${event} ${opening} ${eco} ${year ?? ''}`.toLowerCase(),
      };
      rawById!.set(id, raw);
      if (!rawByCollection!.has(key)) rawByCollection!.set(key, []);
      rawByCollection!.get(key)!.push(raw);
    }
  }

  buildSortedViews();

  const manifest = getOpeningsManifest();
  collections = [...rawByCollection!.entries()]
    .map(([key, gs]) => {
      const m = manifest[key];
      const category: 'elite' | 'player' | 'opening' =
        key === ELITE_KEY ? 'elite' : m ? 'opening' : 'player';
      return {
        key,
        label: labels.get(key)!,
        count: gs.length,
        category,
        ...(m ? { group: m.group, popular: m.popular } : {}),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  console.log(
    `[master-games] Indexed metadata for ${rawById!.size} games across ${collections.length} collections.`,
  );
}

// ── On-demand full parse (drill) ─────────────────────────────────────────────

function parseRaw(raw: RawGame): MasterGame | null {
  const cached = parsedById.get(raw.id);
  if (cached) return cached;

  const pgn = loadPgnForRaw(raw);
  if (pgn === null) return null;

  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch { return null; }
  const verbose = chess.history({ verbose: true });
  if (verbose.length === 0) return null;

  const game: MasterGame = {
    ...rawToSummary(raw),
    moves: verbose.map(m => m.san),
    uciMoves: verbose.map(m => m.from + m.to + (m.promotion ?? '')),
  };
  parsedById.set(raw.id, game);
  return game;
}

// ── Lazy explorer index ──────────────────────────────────────────────────────
// Built over the Lichess Elite corpus (broad, high-volume opening stats). Legend
// collections are reached via the player browser, not the position explorer, so
// they are intentionally excluded here to keep the index small and fast. If no
// Elite corpus is present, fall back to indexing every collection.

let indexBuilding: Promise<void> | null = null;

// Prebuilt explorer index, generated at build time by
// scripts/build-explorer-index.mjs so the (CPU-heavy) chess.js parse of the
// whole corpus doesn't run on every server cold start.
const INDEX_FILE = path.join(DATA_DIR, 'explorer-index.json');
const INDEX_VERSION = 1;

interface SerializedIndex {
  v: number;
  // [positionKey, gameIds, [uci, san, gameCount, whiteWins, draws, blackWins][]]
  positions: Array<[string, string[], Array<[string, string, number, number, number, number]>]>;
}

function serializeIndex(index: Map<string, PositionEntry>): string {
  const positions: SerializedIndex['positions'] = [];
  for (const [key, entry] of index) {
    const moves: Array<[string, string, number, number, number, number]> = [];
    for (const m of entry.moves.values()) {
      moves.push([m.uci, m.san, m.gameCount, m.whiteWins, m.draws, m.blackWins]);
    }
    positions.push([key, entry.gameIds, moves]);
  }
  return JSON.stringify({ v: INDEX_VERSION, positions } satisfies SerializedIndex);
}

function deserializeIndex(json: string): Map<string, PositionEntry> {
  const data = JSON.parse(json) as SerializedIndex;
  if (data.v !== INDEX_VERSION) throw new Error(`index version ${data.v} != ${INDEX_VERSION}`);
  const index = new Map<string, PositionEntry>();
  for (const [key, gameIds, moves] of data.positions) {
    const moveMap = new Map<string, MoveStat>();
    for (const [uci, san, gameCount, whiteWins, draws, blackWins] of moves) {
      moveMap.set(uci, { san, uci, gameCount, whiteWins, draws, blackWins });
    }
    index.set(key, { moves: moveMap, gameIds });
  }
  return index;
}

/** Load the prebuilt index artifact if present. Returns true on success. */
function loadIndexFromDisk(): boolean {
  try {
    if (!fs.existsSync(INDEX_FILE)) return false;
    positionIndex = deserializeIndex(fs.readFileSync(INDEX_FILE, 'utf-8'));
    console.log(`[master-games] Loaded prebuilt explorer index (${positionIndex.size} positions) from ${INDEX_FILE}.`);
    return true;
  } catch (err) {
    console.warn('[master-games] Failed to load prebuilt explorer index, will build live:', err);
    return false;
  }
}

function ensureIndex(): Promise<void> {
  if (positionIndex) return Promise.resolve();
  if (indexBuilding) return indexBuilding;
  indexBuilding = (async () => {
    ensureMetadata();
    // Fast path: use the prebuilt artifact shipped with the deploy.
    if (loadIndexFromDisk()) return;
    // Fallback (e.g. dev without a prebuilt file): build it live, chunked.
    await buildIndexAsync();
  })();
  return indexBuilding;
}

/**
 * Build the explorer index and write it to disk as a JSON artifact.
 * Invoked at build time (scripts/build-explorer-index.mjs), not at runtime.
 * Returns the path written.
 */
export async function buildExplorerIndexToFile(outPath: string = INDEX_FILE): Promise<string> {
  ensureMetadata();
  positionIndex = null; // force a fresh build even if one was already loaded
  await buildIndexAsync();
  fs.writeFileSync(outPath, serializeIndex(positionIndex!));
  return outPath;
}

async function buildIndexAsync(): Promise<void> {
  ensureMetadata();
  const index = new Map<string, PositionEntry>();

  const elite = rawByCollection!.get(ELITE_KEY);
  const source = elite && elite.length > 0 ? elite : [...rawById!.values()];

  let indexed = 0;
  for (const raw of source) {
    // Yield to the event loop frequently so the build never freezes the
    // server (parsing thousands of games with chess.js is CPU-heavy).
    if (indexed % 20 === 0) await new Promise(r => setImmediate(r));

    // Single chess.js pass per game: parse once, then replay with from/to
    // objects (much cheaper than re-parsing SAN strings). Reuses the drill
    // cache when the game was already parsed on demand.
    const cached = parsedById.get(raw.id);
    let sans: string[];
    let ucis: string[];
    if (cached) {
      sans = cached.moves;
      ucis = cached.uciMoves;
    } else {
      const pgn = loadPgnForRaw(raw);
      if (pgn === null) continue;
      const parsed = new Chess();
      try { parsed.loadPgn(pgn); } catch { continue; }
      const hist = parsed.history({ verbose: true });
      if (hist.length === 0) continue;
      sans = hist.map(m => m.san);
      ucis = hist.map(m => m.from + m.to + (m.promotion ?? ''));
      // Populate the drill cache too — the guess trainer gets it for free.
      parsedById.set(raw.id, { ...rawToSummary(raw), moves: sans, uciMoves: ucis });
    }
    indexed++;

    const chess = new Chess();
    const plies = Math.min(sans.length, INDEX_PLIES);
    const seenPositions = new Set<string>();
    const seenMoves = new Set<string>();

    for (let ply = 0; ply <= plies; ply++) {
      const key = positionKey(chess.fen());
      let entry = index.get(key);
      if (!entry) { entry = { moves: new Map(), gameIds: [] }; index.set(key, entry); }
      if (!seenPositions.has(key)) { entry.gameIds.push(raw.id); seenPositions.add(key); }

      if (ply < plies) {
        const uci = ucis[ply];
        const san = sans[ply];
        let stat = entry.moves.get(uci);
        if (!stat) { stat = { san, uci, gameCount: 0, whiteWins: 0, draws: 0, blackWins: 0 }; entry.moves.set(uci, stat); }
        const moveKey = `${key}|${uci}`;
        if (!seenMoves.has(moveKey)) {
          seenMoves.add(moveKey);
          stat.gameCount++;
          if (raw.result === '1-0') stat.whiteWins++;
          else if (raw.result === '0-1') stat.blackWins++;
          else if (raw.result === '1/2-1/2') stat.draws++;
        }
        try {
          chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
        } catch { break; }
      }
    }
  }

  positionIndex = index;
  console.log(`[master-games] Built explorer index from ${indexed} games, ${index.size} positions.`);
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Warm the cheap metadata cache (called at startup). */
export function warmMasterGames(): void {
  ensureMetadata();
}

/** Build the explorer index in the background (non-blocking, chunked). */
export function prewarmExplorerIndex(): Promise<void> {
  return ensureIndex();
}

export function getCollections(): Collection[] {
  ensureMetadata();
  return collections!;
}

export interface CollectionGamesResult {
  games: MasterGameSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type GamesSortBy = 'date' | 'moves';
export type SortDir = 'asc' | 'desc';

export interface CollectionGamesOpts {
  search?: string;             // matches opponent / opening / ECO / year / event
  sortBy?: GamesSortBy;        // default 'date'
  sortDir?: SortDir;           // default 'desc'
  page: number;
  pageSize: number;
}

function matchesSearch(g: RawGame, q: string): boolean {
  if (!q) return true;
  // `_hay` is precomputed at index time — no per-request string building.
  // Every whitespace-separated term must appear (AND semantics).
  return q.split(/\s+/).every(term => g._hay.includes(term));
}

// Pre-sorted views per collection, built once at index time so paginated list
// requests filter (order-preserving) instead of re-sorting thousands of rows
// on every keystroke/page turn.
type SortKey = `${GamesSortBy}-${SortDir}`;
let sortedByCollection: Map<string, Record<SortKey, RawGame[]>> | null = null;

function buildSortedViews(): void {
  const byDateDesc = (a: RawGame, b: RawGame) => {
    const ay = a.year ?? 0, by = b.year ?? 0;
    if (ay !== by) return by - ay;
    return b.date.localeCompare(a.date);
  };
  const byDateAsc = (a: RawGame, b: RawGame) => -byDateDesc(a, b);
  const byMovesDesc = (a: RawGame, b: RawGame) => b.plies - a.plies;
  const byMovesAsc = (a: RawGame, b: RawGame) => a.plies - b.plies;

  sortedByCollection = new Map();
  for (const [key, list] of rawByCollection!.entries()) {
    sortedByCollection.set(key, {
      'date-desc': [...list].sort(byDateDesc),
      'date-asc': [...list].sort(byDateAsc),
      'moves-desc': [...list].sort(byMovesDesc),
      'moves-asc': [...list].sort(byMovesAsc),
    });
  }
}

export function getGamesByCollection(key: string, opts: CollectionGamesOpts): CollectionGamesResult {
  ensureMetadata();
  const { page, pageSize } = opts;
  const sortBy = opts.sortBy ?? 'date';
  const sortDir = opts.sortDir ?? 'desc';
  const q = (opts.search ?? '').toLowerCase().trim();

  // Order-preserving filter over the pre-sorted view — no per-request sort.
  const ordered = sortedByCollection?.get(key)?.[`${sortBy}-${sortDir}` as SortKey]
    ?? rawByCollection!.get(key) ?? [];
  const list = q ? ordered.filter(g => matchesSearch(g, q)) : ordered;

  const total = list.length;
  const start = (page - 1) * pageSize;
  const games = list.slice(start, start + pageSize).map(rawToSummary);
  return { games, total, page, pageSize };
}

export function getMasterGameById(id: string): MasterGame | undefined {
  ensureMetadata();
  const raw = rawById!.get(id);
  if (!raw) return undefined;
  return parseRaw(raw) ?? undefined;
}

/**
 * Walk the given UCI line from the start position and return the master-move
 * stats + games that reached the resulting position.
 */
export async function getExplorer(uciLine: string[], page: number, pageSize: number): Promise<ExplorerResult> {
  await ensureIndex();

  const chess = new Chess();
  let legal = true;
  for (const uci of uciLine) {
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
      if (!move) { legal = false; break; }
    } catch { legal = false; break; }
  }

  const fen = chess.fen();
  const empty: ExplorerResult = { fen, moves: [], totalGames: 0, games: [], total: 0, page, pageSize };
  if (!legal) return empty;

  const entry = positionIndex!.get(positionKey(fen));
  if (!entry) return empty;

  const moves = [...entry.moves.values()].sort(
    (a, b) => b.gameCount - a.gameCount || a.san.localeCompare(b.san),
  );

  const total = entry.gameIds.length;
  const start = (page - 1) * pageSize;
  const games = entry.gameIds.slice(start, start + pageSize)
    .map(id => rawById!.get(id))
    .filter((g): g is RawGame => !!g)
    .map(rawToSummary);

  return { fen, moves, totalGames: total, games, total, page, pageSize };
}
