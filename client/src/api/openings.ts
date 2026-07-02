import { Opening, OpeningsResponse, FamilySummariesResponse, FirstMoveTab } from '../types';
import { cached } from './cache';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export async function fetchOpenings(params: {
  search?: string;
  eco?: string;
  family?: string;
  /** Comma-separated exact family names — uses server fast-path (no full load) */
  families?: string;
  page?: number;
  pageSize?: number;
}): Promise<OpeningsResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.eco) q.set('eco', params.eco);
  if (params.family) q.set('family', params.family);
  if (params.families) q.set('families', params.families);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));

  const res = await fetch(`${BASE}/openings?${q.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch only openings belonging to the given family names.
 * Uses GET /api/openings?families=... (server-side fast-path).
 * Returns all results in one shot — no pagination needed for curated lists.
 */
export async function fetchOpeningsByFamilies(families: string[]): Promise<Opening[]> {
  if (families.length === 0) return [];
  const familyList = families.join(',');
  // Curated family sets are static — cache by the requested families.
  return cached(`openings/families-list:${familyList}`, async () => {
    const q = new URLSearchParams({
      families: familyList,
      pageSize: '5000',   // more than enough for any curated list
    });
    const res = await fetch(`${BASE}/openings?${q.toString()}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data: OpeningsResponse = await res.json();
    return data.openings;
  });
}

export async function fetchFamilies(): Promise<string[]> {
  const res = await fetch(`${BASE}/openings/families`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.families;
}

export async function fetchFamilySummaries(params: {
  firstMove?: FirstMoveTab;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<FamilySummariesResponse> {
  const q = new URLSearchParams();
  if (params.firstMove) q.set('firstMove', params.firstMove);
  if (params.search)    q.set('search',    params.search);
  if (params.page)      q.set('page',      String(params.page));
  if (params.pageSize)  q.set('pageSize',  String(params.pageSize));
  const qs = q.toString();
  // Paginated but static per query — cache by the exact query string.
  return cached(`openings/families:${qs}`, async () => {
    const res = await fetch(`${BASE}/openings/families?${qs}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json() as Promise<FamilySummariesResponse>;
  });
}

export async function fetchOpening(eco: string, name: string): Promise<Opening> {
  const q = new URLSearchParams({ eco, name });
  const res = await fetch(`${BASE}/openings/single?${q.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
