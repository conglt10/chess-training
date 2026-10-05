import { ExplorerResult, MasterGame, MasterGameSummary, Collection, CollectionGamesResponse, GameResult } from '../types';
import { cached } from './cache';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const STATIC = `${import.meta.env.BASE_URL}data/masters`;

// Collections + per-collection game lists are static per deploy, exported by
// `server/scripts/build-static-masters.mjs` into public/data/masters. They are
// served by the static site (no cold start), and search/sort/paging runs here.
export async function fetchCollections(): Promise<Collection[]> {
  return cached('master-games/collections', async () => {
    const res = await fetch(`${STATIC}/collections.json`);
    if (!res.ok) throw new Error(`Static data error: ${res.status}`);
    return res.json() as Promise<Collection[]>;
  });
}

// [id, white, black, whiteElo, blackElo, event, date, result, eco, opening, plies]
type GameRow = [string, string, string, number | null, number | null, string, string, GameResult, string, string, number];

type IndexedGame = MasterGameSummary & { _hay: string };
type SortKey = 'date-desc' | 'date-asc' | 'moves-desc' | 'moves-asc';

const byDateDesc = (a: IndexedGame, b: IndexedGame) => {
  const ay = a.year ?? 0, by = b.year ?? 0;
  if (ay !== by) return by - ay;
  return b.date.localeCompare(a.date);
};
const SORTS: Record<SortKey, (a: IndexedGame, b: IndexedGame) => number> = {
  'date-desc': byDateDesc,
  'date-asc': (a, b) => -byDateDesc(a, b),
  'moves-desc': (a, b) => b.plies - a.plies,
  'moves-asc': (a, b) => a.plies - b.plies,
};

interface CollectionIndex {
  games: IndexedGame[];
  sorted: Partial<Record<SortKey, IndexedGame[]>>;
}

function loadCollection(key: string): Promise<CollectionIndex> {
  return cached(`master-games/collection-data:${key}`, async () => {
    const [res, collections] = await Promise.all([
      fetch(`${STATIC}/games/${encodeURIComponent(key)}.json`),
      fetchCollections(),
    ]);
    if (res.status === 404) return { games: [], sorted: {} };
    if (!res.ok) throw new Error(`Static data error: ${res.status}`);
    const rows = (await res.json()) as GameRow[];
    const label = collections.find(c => c.key === key)?.label ?? key;
    const games = rows.map(([id, white, black, whiteElo, blackElo, event, date, result, eco, opening, plies]): IndexedGame => {
      const y = parseInt(date.slice(0, 4), 10);
      const year = Number.isFinite(y) ? y : null;
      return {
        id, white, black, whiteElo, blackElo, event, date, year, result, eco, opening, plies,
        collectionKey: key,
        collection: label,
        _hay: `${white} ${black} ${event} ${opening} ${eco} ${year ?? ''}`.toLowerCase(),
      };
    });
    return { games, sorted: {} };
  });
}

function sortedView(idx: CollectionIndex, key: SortKey): IndexedGame[] {
  return (idx.sorted[key] ??= [...idx.games].sort(SORTS[key]));
}

export async function fetchCollectionGames(params: {
  key: string;
  search?: string;
  sortBy?: 'date' | 'moves';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): Promise<CollectionGamesResponse> {
  const idx = await loadCollection(params.key);
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const ordered = sortedView(idx, `${params.sortBy ?? 'date'}-${params.sortDir ?? 'desc'}`);
  // Every whitespace-separated term must appear (AND semantics), as on the server.
  const terms = (params.search ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const list = terms.length ? ordered.filter(g => terms.every(t => g._hay.includes(t))) : ordered;
  const start = (page - 1) * pageSize;
  const games = list.slice(start, start + pageSize).map(({ _hay, ...g }) => g);
  return { games, total: list.length, page, pageSize };
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
