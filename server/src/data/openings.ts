import * as fs from 'fs';
import * as path from 'path';
import { Opening } from '../types';

// Local TSV files — populated by running `npm run download-tsv`
const TSV_DIR = (() => {
  const p1 = path.join(__dirname, 'tsv');
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(__dirname, '..', '..', 'src', 'data', 'tsv');
  if (fs.existsSync(p2)) return p2;
  const p3 = path.join(process.cwd(), 'src', 'data', 'tsv');
  if (fs.existsSync(p3)) return p3;
  return p1; // default fallback
})();
const TSV_FILES = ['a', 'b', 'c', 'd', 'e'];

// ── In-memory cache ──────────────────────────────────────────────────────────
let cachedOpenings: Opening[] | null = null;
// Family-keyed index built once alongside the full cache
let familyIndex: Map<string, Opening[]> | null = null;

// ── Parsers ──────────────────────────────────────────────────────────────────
function parsePgnToMoves(pgn: string): string[] {
  return pgn
    .replace(/\d+\.\s*/g, '')
    .trim()
    .split(/\s+/)
    .filter(m => m.length > 0);
}

function extractFamily(name: string): string {
  if (name.includes('London System')) return 'London System';
  
  let family = name.split(':')[0].trim();
  // Handle common Lichess TSV naming patterns where the family is sub-divided
  // e.g., "King's Gambit Accepted" -> "King's Gambit"
  if (family.endsWith(' Accepted')) {
    family = family.replace(' Accepted', '');
  } else if (family.endsWith(' Declined')) {
    family = family.replace(' Declined', '');
  }
  return family;
}

function parseTsv(content: string): Opening[] {
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const openings: Opening[] = [];

  for (const line of lines) {
    if (line.startsWith('eco\t')) continue; // skip header row
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [eco, name, pgn] = parts;
    const moves = parsePgnToMoves(pgn);
    openings.push({
      eco: eco.trim(),
      name: name.trim(),
      pgn: pgn.trim(),
      moves,
      family: extractFamily(name.trim()),
    });
  }
  return openings;
}

// ── Loader ───────────────────────────────────────────────────────────────────
function loadFromDisk(): Opening[] {
  const all: Opening[] = [];

  for (const file of TSV_FILES) {
    const filePath = path.join(TSV_DIR, `${file}.tsv`);
    if (!fs.existsSync(filePath)) {
      console.warn(`[openings] TSV file not found: ${filePath}`);
      console.warn('[openings] Run `npm run download-tsv` to download data files.');
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseTsv(content);
    all.push(...parsed);
  }

  return all;
}

function buildFamilyIndex(openings: Opening[]): Map<string, Opening[]> {
  const map = new Map<string, Opening[]>();
  for (const o of openings) {
    const key = o.family.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  return map;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the full openings dataset (cached after first load).
 */
export function getAllOpenings(): Opening[] {
  if (!cachedOpenings) {
    console.log('[openings] Loading from local TSV files…');
    cachedOpenings = loadFromDisk();
    familyIndex    = buildFamilyIndex(cachedOpenings);
    console.log(`[openings] Loaded ${cachedOpenings.length} openings.`);
  }
  return cachedOpenings;
}

/**
 * Returns openings that belong to any of the requested family names.
 * Much faster than loading everything when only a curated subset is needed.
 *
 * @param families - Array of exact family names (case-insensitive)
 */
export function getOpeningsByFamilies(families: string[]): Opening[] {
  // Ensure cache is warm
  getAllOpenings();

  const result: Opening[] = [];
  for (const name of families) {
    const rows = familyIndex!.get(name.toLowerCase()) ?? [];
    result.push(...rows);
  }
  return result;
}

// ── First-move classifier ─────────────────────────────────────────────────────
export type FirstMoveTab = 'e4' | 'd4' | 'other';

function classifyFirstMove(opening: Opening): FirstMoveTab {
  const first = opening.moves[0]?.toLowerCase();
  if (first === 'e4') return 'e4';
  if (first === 'd4') return 'd4';
  return 'other';
}

export interface FamilySummary {
  name: string;
  /** Total number of variations in this family */
  count: number;
  /** First 4 moves of the representative (first) variation */
  previewMoves: string[];
}

export interface FamilySummariesResponse {
  families: FamilySummary[];
  total: number;
  page: number;
  pageSize: number;
  /** Total variation counts per tab (for the tab badge) */
  tabCounts: Record<FirstMoveTab, number>;
}

/**
 * Returns paginated family summaries, optionally filtered by firstMove tab
 * and/or a family name search string.
 *
 * Intended for the "Classify Openings" view — avoids sending the full
 * openings payload to the client.
 */
export function getFamilySummaries(opts: {
  firstMove?: FirstMoveTab;
  search?: string;
  page: number;
  pageSize: number;
}): FamilySummariesResponse {
  const all = getAllOpenings();

  // Build per-tab family maps once per call (data is already in memory)
  const tabFamilyMap: Record<FirstMoveTab, Map<string, Opening[]>> = {
    e4:    new Map(),
    d4:    new Map(),
    other: new Map(),
  };
  const tabCounts: Record<FirstMoveTab, number> = { e4: 0, d4: 0, other: 0 };

  for (const o of all) {
    const tab = classifyFirstMove(o);
    tabCounts[tab]++;
    const map = tabFamilyMap[tab];
    if (!map.has(o.family)) map.set(o.family, []);
    map.get(o.family)!.push(o);
  }

  // Select the map for the requested tab (or all families merged if no tab)
  let familyMap: Map<string, Opening[]>;
  if (opts.firstMove) {
    familyMap = tabFamilyMap[opts.firstMove];
  } else {
    // Merge all tabs
    familyMap = new Map();
    for (const tab of (['e4', 'd4', 'other'] as FirstMoveTab[])) {
      for (const [name, rows] of tabFamilyMap[tab]) {
        if (!familyMap.has(name)) familyMap.set(name, []);
        familyMap.get(name)!.push(...rows);
      }
    }
  }

  // Apply family-name search filter and sort
  const lower = (opts.search ?? '').toLowerCase().trim();
  let familyNames = [...familyMap.keys()].sort();
  if (lower) {
    familyNames = familyNames.filter(n => n.toLowerCase().includes(lower));
  }

  const total = familyNames.length;
  const { page, pageSize } = opts;
  const start = (page - 1) * pageSize;
  const pageNames = familyNames.slice(start, start + pageSize);

  const families: FamilySummary[] = pageNames.map(name => {
    const variations = familyMap.get(name)!;
    return {
      name,
      count: variations.length,
      previewMoves: variations[0]?.moves.slice(0, 4) ?? [],
    };
  });

  return { families, total, page, pageSize, tabCounts };
}

// ── Opening identification (for Game Review) ───────────────────────────────────

/** Strip check/mate/annotation glyphs so SAN compares cleanly across sources. */
function normalizeSan(san: string): string {
  return san.replace(/[+#!?]/g, '').replace(/0/g, 'O'); // 0-0 → O-O
}

// Map of "normalized SAN move sequence" → opening, built once and cached.
let openingByLine: Map<string, Opening> | null = null;
let maxOpeningPlies = 0;

function buildOpeningLineIndex(): Map<string, Opening> {
  const map = new Map<string, Opening>();
  let maxLen = 0;
  for (const o of getAllOpenings()) {
    const key = o.moves.map(normalizeSan).join(' ');
    if (key.length === 0) continue;
    // Prefer the longer / more specific entry if two share the same line.
    map.set(key, o);
    if (o.moves.length > maxLen) maxLen = o.moves.length;
  }
  maxOpeningPlies = maxLen;
  return map;
}

/**
 * Identify the opening for a game given its SAN move list. Returns the opening
 * whose full move sequence is the LONGEST prefix of the supplied moves.
 */
export function identifyOpening(sanMoves: string[]): Opening | null {
  if (!openingByLine) openingByLine = buildOpeningLineIndex();

  const norm = sanMoves.map(normalizeSan);
  const limit = Math.min(norm.length, maxOpeningPlies);

  // Try the longest possible prefix first, shrinking until we find a match.
  for (let len = limit; len >= 1; len--) {
    const key = norm.slice(0, len).join(' ');
    const found = openingByLine.get(key);
    if (found) return found;
  }
  return null;
}

/**
 * Backwards-compatible alias used by the server entry point.
 */
export async function loadAllOpenings(): Promise<Opening[]> {
  return getAllOpenings();
}

/**
 * Backwards-compatible alias used by existing route handlers.
 */
export async function getOpenings(): Promise<Opening[]> {
  return getAllOpenings();
}
