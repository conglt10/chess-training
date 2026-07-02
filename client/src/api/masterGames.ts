import { ExplorerResult, MasterGame, Collection, CollectionGamesResponse } from '../types';
import { cached } from './cache';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export async function fetchCollections(): Promise<Collection[]> {
  // Static for the session — cache so re-entering Masters mode doesn't refetch.
  return cached('master-games/collections', async () => {
    const res = await fetch(`${BASE}/master-games/collections`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    return data.collections as Collection[];
  });
}

export async function fetchCollectionGames(params: {
  key: string;
  search?: string;
  sortBy?: 'date' | 'moves';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): Promise<CollectionGamesResponse> {
  const q = new URLSearchParams({ key: params.key });
  if (params.search) q.set('search', params.search);
  if (params.sortBy) q.set('sortBy', params.sortBy);
  if (params.sortDir) q.set('sortDir', params.sortDir);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  const res = await fetch(`${BASE}/master-games/by-collection?${q.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch master-move stats + games reaching the position after `play`.
 * @param play - UCI moves of the line so far (e.g. ['e2e4', 'c7c5'])
 */
export async function fetchExplorer(params: {
  play: string[];
  page?: number;
  pageSize?: number;
}): Promise<ExplorerResult> {
  const q = new URLSearchParams();
  if (params.play.length) q.set('play', params.play.join(','));
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));

  const res = await fetch(`${BASE}/master-games/explorer?${q.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchMasterGame(id: string): Promise<MasterGame> {
  const res = await fetch(`${BASE}/master-games/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
