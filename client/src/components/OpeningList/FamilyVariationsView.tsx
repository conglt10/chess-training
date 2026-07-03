import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Opening } from '../../types';
import { fetchOpenings } from '../../api/openings';
import { openingPath } from '../../paths';
import './FamilyVariationsView.css';

interface FamilyVariationsViewProps {
  family: string;
  color: string;
  onBack: () => void;
}

type SortKey = 'default' | 'moves-asc' | 'moves-desc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default', label: 'Default order' },
  { key: 'moves-desc', label: 'Most moves' },
  { key: 'moves-asc', label: 'Fewest moves' },
];

const PAGE_SIZE = 24;

export default function FamilyVariationsView({
  family,
  color,
  onBack,
}: FamilyVariationsViewProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [page, setPage] = useState(1);

  const [variations, setVariations] = useState<Opening[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Reset when the family changes
  useEffect(() => {
    setSearch(''); setDebouncedSearch(''); setSortKey('default'); setPage(1);
  }, [family]);

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, sortKey]);

  // Fetch the current page of variations (server-side search + sort + paging).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const sortBy = sortKey === 'default' ? undefined : 'moves';
    const sortDir = sortKey === 'moves-asc' ? 'asc' : 'desc';
    fetchOpenings({
      families: family,
      search: debouncedSearch || undefined,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    })
      .then(res => { if (!cancelled) { setVariations(res.openings); setTotal(res.total); } })
      .catch(() => { if (!cancelled) { setVariations([]); setTotal(0); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [family, debouncedSearch, sortKey, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="fvv-container">
      {/* Header */}
      <div className="fvv-header" style={{ '--fvv-color': color } as React.CSSProperties}>
        <button className="fvv-back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="fvv-header-info">
          <h2 className="fvv-title">{family}</h2>
          <p className="fvv-subtitle">
            {debouncedSearch
              ? `${total} matching variation${total !== 1 ? 's' : ''}`
              : `${total} variation${total !== 1 ? 's' : ''} — click any to study`}
          </p>
        </div>
        <div className="fvv-count-badge" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}>
          {total}
        </div>
      </div>

      {/* Search + sort toolbar */}
      <div className="fvv-toolbar">
        <input
          className="fvv-search"
          placeholder="Search variations by name or ECO…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className="fvv-sort">
          <span>Sort</span>
          <select className="fvv-sort-select" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {/* Grid of variation cards */}
      <div className="fvv-body">
        {loading && variations.length === 0 ? (
          <div className="fvv-empty">Loading variations…</div>
        ) : variations.length === 0 ? (
          <div className="fvv-empty">
            {debouncedSearch ? `No variations match “${debouncedSearch}”.` : 'No variations found.'}
          </div>
        ) : (
        <div className="fvv-grid">
          {variations.map((opening, i) => (
            <Link
              key={`${opening.eco}-${i}`}
              id={`fvv-card-${opening.eco}-${i}`}
              to={openingPath(opening.eco, opening.name)}
              className="fvv-card"
              style={{ '--fvv-color': color } as React.CSSProperties}
            >
              <div className="fvv-card-top">
                <span className="fvv-card-name">{opening.name}</span>
                <span className="badge badge-gold">{opening.eco}</span>
              </div>
              <div className="fvv-card-moves">
                {opening.moves.slice(0, 10).map((m, mi) => (
                  <span key={mi} className="move-chip">{m}</span>
                ))}
                {opening.moves.length > 10 && (
                  <span className="move-chip">+{opening.moves.length - 10}</span>
                )}
              </div>
              <div className="fvv-card-footer">
                <span className="badge badge-accent">{Math.ceil(opening.moves.length / 2)} moves</span>
                <span className="fvv-card-plies">{opening.moves.length} plies</span>
              </div>
            </Link>
          ))}
        </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="fvv-pager">
          <button className="btn btn-ghost btn-sm" onClick={() => setPage(1)} disabled={page <= 1}>«</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹ Prev</button>
          <span className="fvv-pager-info">Page <strong>{page}</strong> of {totalPages}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next ›</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>»</button>
        </div>
      )}
    </div>
  );
}
