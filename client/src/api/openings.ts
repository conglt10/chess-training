import { Opening, OpeningsResponse } from '../types';

const BASE = '/api';

export async function fetchOpenings(params: {
  search?: string;
  eco?: string;
  family?: string;
  page?: number;
  pageSize?: number;
}): Promise<OpeningsResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.eco) q.set('eco', params.eco);
  if (params.family) q.set('family', params.family);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));

  const res = await fetch(`${BASE}/openings?${q.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchFamilies(): Promise<string[]> {
  const res = await fetch(`${BASE}/openings/families`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.families;
}

export async function fetchOpening(eco: string, name: string): Promise<Opening> {
  const q = new URLSearchParams({ eco, name });
  const res = await fetch(`${BASE}/openings/single?${q.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
