import { Opening, OpeningsResponse, FamilySummariesResponse, FirstMoveTab } from '../types';
import { loadOpeningsBook } from './openingsBook';

// The opening book is static per deploy and served as a static file
// (see ./openingsBook.ts), so every query below runs in the browser with the
// same filter / sort / paging semantics as the old /api/openings endpoints.

export async function fetchOpenings(params: {
  search?: string;
  eco?: string;
  family?: string;
  /** Comma-separated exact family names */
  families?: string;
  sortBy?: 'moves';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): Promise<OpeningsResponse> {
  const book = await loadOpeningsBook();
  const search = (params.search ?? '').toLowerCase().trim();
  const eco = (params.eco ?? '').toUpperCase().trim();
  const family = (params.family ?? '').toLowerCase().trim();
  const familiesParam = (params.families ?? '').trim();
  const page = Math.max(1, params.page ?? 1);
  // Exact-families lookups may fetch a whole curated set in one shot.
  const maxPageSize = familiesParam ? 5000 : 100;
  const pageSize = Math.min(maxPageSize, Math.max(1, params.pageSize ?? 50));

  let filtered: Opening[];
  if (familiesParam) {
    filtered = familiesParam
      .split(',')
      .map(f => f.trim())
      .filter(Boolean)
      .flatMap(f => book.familyIndex.get(f.toLowerCase()) ?? []);
  } else {
    filtered = book.all;
    if (family) filtered = filtered.filter(o => o.family.toLowerCase().includes(family));
  }
  if (search) {
    filtered = filtered.filter(o => o.name.toLowerCase().includes(search) || o.eco.toLowerCase().includes(search));
  }
  if (eco) filtered = filtered.filter(o => o.eco.startsWith(eco));

  if (params.sortBy === 'moves') {
    const dir = params.sortDir === 'asc' ? 1 : -1;
    filtered = [...filtered].sort((a, b) => dir * (a.moves.length - b.moves.length));
  }

  const start = (page - 1) * pageSize;
  return { openings: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize };
}

/**
 * Parent-only list data: the variation count for each family, without fetching
 * any variations. Returns a map keyed by lowercased family name.
 */
export async function fetchFamilyCounts(families: string[]): Promise<Record<string, number>> {
  if (families.length === 0) return {};
  const book = await loadOpeningsBook();
  const map: Record<string, number> = {};
  for (const f of families) map[f.toLowerCase()] = book.familyIndex.get(f.toLowerCase())?.length ?? 0;
  return map;
}

/** All openings belonging to the given (exact) family names. */
export async function fetchOpeningsByFamilies(families: string[]): Promise<Opening[]> {
  if (families.length === 0) return [];
  const book = await loadOpeningsBook();
  return families.flatMap(f => book.familyIndex.get(f.toLowerCase()) ?? []);
}

export async function fetchFamilies(): Promise<string[]> {
  const book = await loadOpeningsBook();
  return book.familyEntries.all.map(e => e.name);
}

export async function fetchFamilySummaries(params: {
  firstMove?: FirstMoveTab;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<FamilySummariesResponse> {
  const book = await loadOpeningsBook();
  const list = book.familyEntries[params.firstMove ?? 'all'];
  const lower = (params.search ?? '').toLowerCase().trim();
  const filtered = lower ? list.filter(e => e.lower.includes(lower)) : list;

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const start = (page - 1) * pageSize;
  const families = filtered.slice(start, start + pageSize).map(e => ({
    name: e.name,
    count: e.variations.length,
    previewMoves: e.variations[0]?.moves.slice(0, 4) ?? [],
  }));

  return { families, total: filtered.length, page, pageSize, tabCounts: book.tabCounts };
}

export async function fetchOpening(eco: string, name: string): Promise<Opening> {
  const book = await loadOpeningsBook();
  const e = eco.toUpperCase().trim();
  const n = name.toLowerCase().trim();
  const opening = book.all.find(o => o.eco === e && o.name.toLowerCase() === n);
  if (!opening) throw new Error('Opening not found');
  return opening;
}
