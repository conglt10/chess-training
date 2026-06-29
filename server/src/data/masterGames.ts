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
const DATA_DIR = path.join(__dirname, 'master-games');

// How deep into each game we index positions (plies = half-moves).
// 40 plies = 20 moves per side, plenty for an opening explorer.
const INDEX_PLIES = 40;
const MIN_PLIES = 12;
const ELITE_KEY = 'lichess-elite';

// A game with its header metadata extracted cheaply, plus the raw PGN text so
// the moves can be parsed on demand (drill) or in bulk (explorer index).
type RawGame = MasterGameSummary & { pgn: string };

// ── In-memory caches ───────────────────────────────────────────────────────
// Cheap header-only metadata (built at startup):
let metaLoaded = false;
let rawById: Map<string, RawGame> | null = null;
let rawByCollection: Map<string, RawGame[]> | null = null;
let collections: Collection[] | null = null;

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

function header(pgn: string, tag: string): string {
  const m = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
  return m ? m[1] : '';
}

/** Cheap ply count from the movetext (no chess.js). */
function countPlies(pgn: string): number {
  const blank = pgn.indexOf('\n\n');
  const movetext = blank === -1 ? '' : pgn.slice(blank + 2);
  return movetext
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t => t && !VALID_RESULTS.has(t as GameResult) && t !== '*').length;
}

// Derive a collection key + human label from a PGN filename.
function collectionFromFile(file: string): { key: string; label: string } {
  if (file === 'games.pgn') return { key: ELITE_KEY, label: 'Lichess Elite (2500+)' };
  const base = file.replace(/\.pgn$/i, '').replace(/^master_games_/, '');
  const label = base
    .split('_')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { key: base, label: label || base };
}

function rawToSummary(raw: RawGame): MasterGameSummary {
  const { pgn, ...summary } = raw;
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
    for (const pgn of splitGames(content)) {
      const result = (header(pgn, 'Result') || '*') as GameResult;
      if (!VALID_RESULTS.has(result)) continue;
      const plies = countPlies(pgn);
      if (plies < MIN_PLIES) continue;

      const date = header(pgn, 'Date');
      const eco = header(pgn, 'ECO');
      let id = crypto.createHash('sha1').update(pgn).digest('hex').slice(0, 12);
      let n = 1;
      while (rawById!.has(id)) id = `${id}-${n++}`;

      const raw: RawGame = {
        id,
        white: header(pgn, 'White') || 'Unknown',
        black: header(pgn, 'Black') || 'Unknown',
        whiteElo: toNum(header(pgn, 'WhiteElo')),
        blackElo: toNum(header(pgn, 'BlackElo')),
        event: header(pgn, 'Event'),
        date,
        year: toNum(date.slice(0, 4)),
        result,
        eco,
        opening: header(pgn, 'Opening') || ecoMap.get(eco) || '',
        plies,
        collectionKey: key,
        collection: label,
        pgn,
      };
      rawById!.set(id, raw);
      if (!rawByCollection!.has(key)) rawByCollection!.set(key, []);
      rawByCollection!.get(key)!.push(raw);
    }
  }

  collections = [...rawByCollection!.entries()]
    .map(([key, gs]) => ({ key, label: labels.get(key)!, count: gs.length }))
    .sort((a, b) => a.label.localeCompare(b.label));

  console.log(
    `[master-games] Indexed metadata for ${rawById!.size} games across ${collections.length} collections.`,
  );
}

// ── On-demand full parse (drill) ─────────────────────────────────────────────

function parseRaw(raw: RawGame): MasterGame | null {
  const cached = parsedById.get(raw.id);
  if (cached) return cached;

  const chess = new Chess();
  try { chess.loadPgn(raw.pgn); } catch { return null; }
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

function ensureIndex(): Promise<void> {
  if (positionIndex) return Promise.resolve();
  if (indexBuilding) return indexBuilding;
  indexBuilding = buildIndexAsync();
  return indexBuilding;
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

    const game = parseRaw(raw);
    if (!game) continue;
    indexed++;

    const chess = new Chess();
    const plies = Math.min(game.moves.length, INDEX_PLIES);
    const seenPositions = new Set<string>();
    const seenMoves = new Set<string>();

    for (let ply = 0; ply <= plies; ply++) {
      const key = positionKey(chess.fen());
      let entry = index.get(key);
      if (!entry) { entry = { moves: new Map(), gameIds: [] }; index.set(key, entry); }
      if (!seenPositions.has(key)) { entry.gameIds.push(game.id); seenPositions.add(key); }

      if (ply < plies) {
        const uci = game.uciMoves[ply];
        const san = game.moves[ply];
        let stat = entry.moves.get(uci);
        if (!stat) { stat = { san, uci, gameCount: 0, whiteWins: 0, draws: 0, blackWins: 0 }; entry.moves.set(uci, stat); }
        const moveKey = `${key}|${uci}`;
        if (!seenMoves.has(moveKey)) {
          seenMoves.add(moveKey);
          stat.gameCount++;
          if (game.result === '1-0') stat.whiteWins++;
          else if (game.result === '0-1') stat.blackWins++;
          else if (game.result === '1/2-1/2') stat.draws++;
        }
        chess.move(san);
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
  const hay = `${g.white} ${g.black} ${g.event} ${g.opening} ${g.eco} ${g.year ?? ''}`.toLowerCase();
  // Every whitespace-separated term must appear (AND semantics).
  return q.split(/\s+/).every(term => hay.includes(term));
}

export function getGamesByCollection(key: string, opts: CollectionGamesOpts): CollectionGamesResult {
  ensureMetadata();
  const { page, pageSize } = opts;
  const sortBy = opts.sortBy ?? 'date';
  const sortDir = opts.sortDir ?? 'desc';
  const q = (opts.search ?? '').toLowerCase().trim();

  let list = rawByCollection!.get(key) ?? [];
  if (q) list = list.filter(g => matchesSearch(g, q));

  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...list].sort((a, b) => {
    if (sortBy === 'moves') return dir * (a.plies - b.plies);
    // 'date' — compare year, then full date string as a tiebreak
    const ay = a.year ?? 0, by = b.year ?? 0;
    if (ay !== by) return dir * (ay - by);
    return dir * a.date.localeCompare(b.date);
  });

  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const games = sorted.slice(start, start + pageSize).map(rawToSummary);
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
