import * as fs from 'fs';
import * as path from 'path';
import { Opening } from '../types';

// Local TSV files — populated by running `npm run download-tsv`
const TSV_DIR = path.join(__dirname, 'tsv');
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
