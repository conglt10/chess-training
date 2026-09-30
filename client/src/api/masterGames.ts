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
  // Static corpus — cache by exact query so paging/sorting back and forth
  // never hits the server twice for the same page.
  const qs = q.toString();
  return cached(`master-games/by-collection:${qs}`, async () => {
    const res = await fetch(`${BASE}/master-games/by-collection?${qs}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json() as Promise<CollectionGamesResponse>;
  });
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

  // Positions are static — cache by exact line+page so Undo/redo and the
  // browser Back button through a line never refetch.
  const qs = q.toString();
  return cached(`master-games/explorer:${qs}`, async () => {
    const res = await fetch(`${BASE}/master-games/explorer?${qs}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json() as Promise<ExplorerResult>;
  });
}

export async function fetchMasterGame(id: string): Promise<MasterGame> {
  // Full games are static — cache so re-entering a drill never re-downloads.
  return cached(`master-games/game:${id}`, async () => {
    const res = await fetch(`${BASE}/master-games/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json() as Promise<MasterGame>;
  });
}
