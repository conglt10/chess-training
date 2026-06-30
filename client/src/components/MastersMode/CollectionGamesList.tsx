import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MasterGameSummary } from '../../types';
import { fetchCollectionGames } from '../../api/masterGames';
import { masterGamePath } from '../../paths';
import './MastersMode.css';

const PAGE_SIZE = 10;

export const SORT_OPTIONS = [
  { key: 'date-desc',  label: 'Newest first',  sortBy: 'date',  sortDir: 'desc' },
  { key: 'date-asc',   label: 'Oldest first',  sortBy: 'date',  sortDir: 'asc' },
  { key: 'moves-desc', label: 'Most moves',    sortBy: 'moves', sortDir: 'desc' },
  { key: 'moves-asc',  label: 'Fewest moves',  sortBy: 'moves', sortDir: 'asc' },
] as const;

/** A player name prefixed with its piece-colour chip. */
export function Side({ name, elo, color }: { name: string; elo: number | null; color: 'w' | 'b' }) {
  return (
    <span className="masters-side">
      <span className={`pc pc-${color}`} aria-hidden />
      <strong>{name}</strong>{elo ? <span className="masters-elo"> ({elo})</span> : null}
    </span>
  );
}

interface Props {
  collectionKey: string;
  title: string;
  /** Optional leading node in the header (e.g. a player avatar or opening badge). */
  leading?: ReactNode;
  backTo: string;
  backLabel?: string;
  /** Passed as the drill `hero` (auto-detect side); omit for opening games. */
  gameHero?: string;
}

/** Per-collection games list with search, sort and pagination. */
export default function CollectionGamesList({ collectionKey, title, leading, backTo, backLabel = '← Back', gameHero }: Props) {
  const navigate = useNavigate();
  const [games, setGames] = useState<MasterGameSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('date-desc');

  useEffect(() => {
    setSearch(''); setDebouncedSearch(''); setSortKey('date-desc'); setPage(1);
  }, [collectionKey]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, sortKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const sort = SORT_OPTIONS.find(o => o.key === sortKey) ?? SORT_OPTIONS[0];
    fetchCollectionGames({ key: collectionKey, search: debouncedSearch, sortBy: sort.sortBy, sortDir: sort.sortDir, page, pageSize: PAGE_SIZE })
      .then(res => { if (!cancelled) { setGames(res.games); setTotal(res.total); } })
      .catch(() => { if (!cancelled) setGames([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [collectionKey, page, debouncedSearch, sortKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="masters-collection-detail">
      <div className="masters-collection-detail-head">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(backTo)}>{backLabel}</button>
        {leading}
        <h3>{title}</h3>
        <span className="badge badge-accent">{total.toLocaleString()} games</span>
      </div>

      <div className="masters-games-toolbar">
        <input
          className="masters-search-input"
          placeholder="Search opponent, opening, ECO or year…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className="masters-sort">
          <span>Sort</span>
          <select className="masters-sort-select" value={sortKey} onChange={e => setSortKey(e.target.value)}>
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {loading && games.length === 0 ? (
        <div className="masters-empty">Loading games…</div>
      ) : games.length === 0 ? (
        <div className="masters-empty">No games match your search.</div>
      ) : (
        <div className="masters-game-list-1col">
          {games.map(g => (
            <button key={g.id} className="masters-game-row" onClick={() => navigate(masterGamePath(g.id, gameHero ? { hero: gameHero } : undefined))}>
              <span className="masters-game-sides">
                <Side name={g.white} elo={g.whiteElo} color="w" />
                <span className="masters-vs">vs</span>
                <Side name={g.black} elo={g.blackElo} color="b" />
              </span>
              <span className="masters-game-meta">
                {g.opening ? <span className="masters-game-opening" title={g.opening}>{g.eco ? `${g.eco} · ` : ''}{g.opening}</span> : (g.eco ? <span className="masters-game-opening">{g.eco}</span> : null)}
                <span className="masters-game-moves">{Math.ceil(g.plies / 2)} moves</span>
                {g.year ? <span className="masters-game-year">{g.year}</span> : null}
                <span className={`masters-result result-${g.result === '1-0' ? 'w' : g.result === '0-1' ? 'b' : 'd'}`}>{g.result}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="masters-pager">
          <button className="masters-pager-btn" onClick={() => setPage(1)} disabled={page <= 1}>«</button>
          <button className="masters-pager-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹ Prev</button>
          <span className="masters-pager-info">Page <strong>{page}</strong> of {totalPages}</span>
          <button className="masters-pager-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next ›</button>
          <button className="masters-pager-btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>»</button>
        </div>
      )}
    </div>
  );
}
