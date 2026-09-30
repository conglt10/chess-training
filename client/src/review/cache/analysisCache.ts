/**
 * analysisCache.ts
 *
 * Client-side LRU cache for full-game reviews (WhyBlunder spec §4).
 * Persists in `localStorage` under `whyblunder_analysis_cache_v2`.
 *
 * - Fingerprint normalization: strips headers, PGN comments (`{}`),
 *   variations (`()`), NAGs (`$N`), and clock stamps (`{[%clk …]}`) before
 *   generating a base-36 hash key.
 * - LRU eviction: capped at 5 full game analyses. On quota exceptions the
 *   cache truncates the oldest 50% of entries and retries once.
 * - Lichess URL / ID resolving: game IDs (e.g. `https://lichess.org/Qa7FJNk2`)
 *   map to a stable `lichess:<id>` key so re-importing the same link is a hit.
 */

import type { Classification } from '../../utils/moveClassifier';
import type { ReviewComment } from '../../utils/reviewCommentator';

export const ANALYSIS_CACHE_KEY = 'whyblunder_analysis_cache_v2';
export const ANALYSIS_CACHE_MAX = 5;

export interface CachedMove {
  ply: number;
  moveNumber: number;
  san: string;
  color: 'w' | 'b';
  from: string;
  to: string;
  uci: string;
  classification: Classification;
  comment: ReviewComment;
  tip?: string;
  isCapture: boolean;
  cpLoss: number;
  evalAfter: number;
  mateAfter: number | null;
  bestUci: string | null;
  bestSan: string | null;
  fenBefore: string;
  fenAfter: string;
}

export interface CachedReview {
  /** Cache schema version — bump to invalidate old entries. */
  v: 2;
  savedAt: number;
  white: string;
  black: string;
  result: string;
  moves: CachedMove[];
  evalSeries: number[];
  openingName: string | null;
  openingEco: string | null;
  accuracy: { white: number; black: number };
  counts: { white: Record<Classification, number>; black: Record<Classification, number> };
}

interface CacheStore {
  entries: Record<string, CachedReview>;
}

// ── Fingerprinting ───────────────────────────────────────────────────────────

/** djb2 hash → unsigned base-36 string. */
function hashBase36(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/**
 * Normalize a PGN for fingerprinting: drop headers, comments, variations,
 * NAGs, clock annotations, results, and collapse whitespace so cosmetic
 * differences map to the same key.
 */
export function normalizePgnForFingerprint(pgn: string): string {
  return pgn
    .replace(/\[[^\]]*\]/g, ' ')          // headers
    .replace(/\{[^}]*\}/g, ' ')           // comments (incl. [%clk …])
    .replace(/\([^()]*\)/g, ' ')          // variations (one level; repeat for nesting)
    .replace(/\([^()]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')               // NAGs
    .replace(/\d+\s*\.\s*(\.\.)?/g, ' ')  // move numbers
    .replace(/(1-0|0-1|1\/2-1\/2|\*)/g, ' ')
    .replace(/[%?!+#]+/g, (m) => (m.includes('#') || m.includes('+') ? m : ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function fingerprintPgn(pgn: string): string {
  return `pgn:${hashBase36(normalizePgnForFingerprint(pgn))}`;
}

/** Extract the 8-char game id from a lichess URL (or bare id). */
export function lichessGameId(input: string): string | null {
  const trimmed = input.trim();
  const bare = /^[A-Za-z0-9]{8,12}$/.exec(trimmed);
  if (bare) return trimmed.slice(0, 8);
  try {
    const u = new URL(trimmed);
    if (!/lichess\.org/i.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean)[0];
    if (!seg || seg.length < 8) return null;
    if (/^(study|training|analysis|board|embed|tournament|broadcast)/i.test(seg)) return null;
    return seg.slice(0, 8);
  } catch {
    return null;
  }
}

export function fingerprintForInput(pgnOrUrl: string): string {
  const id = lichessGameId(pgnOrUrl);
  if (id) return `lichess:${id}`;
  return fingerprintPgn(pgnOrUrl);
}

// ── Store access ─────────────────────────────────────────────────────────────

function loadStore(): CacheStore {
  try {
    const raw = localStorage.getItem(ANALYSIS_CACHE_KEY);
    if (!raw) return { entries: {} };
    const parsed = JSON.parse(raw) as CacheStore;
    if (!parsed || typeof parsed.entries !== 'object') return { entries: {} };
    return parsed;
  } catch {
    return { entries: {} };
  }
}

function saveStore(store: CacheStore): void {
  const raw = JSON.stringify(store);
  try {
    localStorage.setItem(ANALYSIS_CACHE_KEY, raw);
  } catch (e) {
    if (isQuotaError(e)) {
      // Truncate the oldest 50% and retry once.
      const keys = Object.keys(store.entries).sort(
        (a, b) => store.entries[a].savedAt - store.entries[b].savedAt,
      );
      const drop = Math.max(1, Math.ceil(keys.length / 2));
      for (const k of keys.slice(0, drop)) delete store.entries[k];
      try {
        localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(store));
      } catch {
        /* storage unavailable — reviews simply won't persist */
      }
    }
  }
}

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

function evictLru(store: CacheStore): void {
  const keys = Object.keys(store.entries);
  if (keys.length < ANALYSIS_CACHE_MAX) return;
  keys
    .sort((a, b) => store.entries[a].savedAt - store.entries[b].savedAt)
    .slice(0, keys.length - ANALYSIS_CACHE_MAX + 1)
    .forEach(k => delete store.entries[k]);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getCachedReview(key: string): CachedReview | null {
  try {
    const entry = loadStore().entries[key];
    if (!entry || entry.v !== 2 || !Array.isArray(entry.moves)) return null;
    // LRU touch.
    const store = loadStore();
    if (store.entries[key]) {
      store.entries[key].savedAt = Date.now();
      saveStore(store);
    }
    return entry;
  } catch {
    return null;
  }
}

export function setCachedReview(key: string, review: Omit<CachedReview, 'v' | 'savedAt'>): void {
  try {
    const store = loadStore();
    evictLru(store);
    store.entries[key] = { ...review, v: 2, savedAt: Date.now() };
    saveStore(store);
  } catch {
    /* non-fatal */
  }
}

export function clearAnalysisCache(): void {
  try {
    localStorage.removeItem(ANALYSIS_CACHE_KEY);
  } catch {
    /* noop */
  }
}
