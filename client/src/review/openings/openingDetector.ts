/**
 * openingDetector.ts
 *
 * Frontend ECO + book detector for the Game Review (WhyBlunder spec:
 * `OpeningDetector: ECO & Book Filtering`).
 *
 * The opening book is generated at build time by
 * `client/scripts/build-openings-json.mjs` into `public/data/openings.json`
 * and lazy-fetched on first use (cached in memory afterwards). Identification
 * is the longest matching prefix of the game's SAN moves, mirroring the
 * previous server implementation.
 *
 * A move counts as "book" only while the matched line covers it AND the
 * position is within the first 16 plies.
 */

export interface DetectedOpening {
  eco: string;
  name: string;
  family: string;
  /** Plies of the matched opening line (capped at 16 for book purposes). */
  ply: number;
}

interface BookEntry {
  eco: string;
  name: string;
  family: string;
  moves: string[];
}

export const BOOK_MAX_PLY = 16;

let bookCache: BookEntry[] | null = null;
let bookFailed = false;

/** Strip check/mate/annotation glyphs so SAN compares cleanly. */
function normalizeSan(san: string): string {
  return san.replace(/[+#!?]/g, '').replace(/0/g, 'O');
}

async function loadBook(): Promise<BookEntry[]> {
  if (bookCache) return bookCache;
  if (bookFailed) return [];
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/openings.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bookCache = (await res.json()) as BookEntry[];
  } catch {
    bookFailed = true;
    return [];
  }
  return bookCache ?? [];
}

/**
 * Identify the opening for a game given its SAN move list. Returns the
 * opening whose full move sequence is the LONGEST prefix of the game, or
 * null when nothing matches (or the book failed to load — fail open).
 */
export async function identifyOpeningLocal(sanMoves: string[]): Promise<DetectedOpening | null> {
  if (sanMoves.length === 0) return null;
  const book = await loadBook();
  if (book.length === 0) return null;

  const norm = sanMoves.map(normalizeSan);
  // Index by first move to avoid scanning ~3.7k lines per call.
  let best: BookEntry | null = null;
  for (const entry of book) {
    if (entry.moves.length <= (best?.moves.length ?? 0)) continue;
    if (entry.moves.length > norm.length) continue;
    let ok = true;
    for (let k = 0; k < entry.moves.length; k++) {
      if (normalizeSan(entry.moves[k]) !== norm[k]) { ok = false; break; }
    }
    if (ok) best = entry;
  }
  if (!best) return null;
  return {
    eco: best.eco,
    name: best.name,
    family: best.family,
    ply: Math.min(best.moves.length, BOOK_MAX_PLY),
  };
}

/** True while `plyIndex` (0-based) is still inside the recognised book line. */
export function isBookPly(plyIndex: number, opening: DetectedOpening | null): boolean {
  if (!opening) return false;
  return plyIndex < opening.ply;
}
