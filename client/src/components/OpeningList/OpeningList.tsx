import { useState, useEffect, useCallback } from 'react';
import './OpeningList.css';
import { Opening } from '../../types';
import { fetchOpenings } from '../../api/openings';
import PopularOpenings from './PopularOpenings';
import MostPopularOpenings from './MostPopularOpenings';
import FamilyVariations from './FamilyVariations';

interface OpeningListProps {
  onSelect: (opening: Opening) => void;
  selectedFamily: {
    name: string;
    variations: Opening[];
    description?: string;
    badge?: string;
    color?: string;
    icon?: string;
  } | null;
  setSelectedFamily: (family: {
    name: string;
    variations: Opening[];
    description?: string;
    badge?: string;
    color?: string;
    icon?: string;
  } | null) => void;
}

const ECO_GROUPS = ['A', 'B', 'C', 'D', 'E'];
type ListMode = 'top' | 'popular' | 'browse';

export default function OpeningList({ onSelect, selectedFamily, setSelectedFamily }: OpeningListProps) {
  const [mode, setMode] = useState<ListMode>('top');
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ecoFilter, setEcoFilter] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOpenings({ search, eco: ecoFilter, page, pageSize: PAGE_SIZE });
      setOpenings(data.openings);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, ecoFilter, page]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => { setPage(1); }, [search, ecoFilter]);

  // Group openings by family name
  const grouped = openings.reduce<Record<string, Opening[]>>((acc, o) => {
    const key = o.family;
    if (!acc[key]) acc[key] = [];
    acc[key].push(o);
    return acc;
  }, {});

  const families = Object.keys(grouped).sort();
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (selectedFamily) {
    return (
      <div className="opening-list-container">
        <FamilyVariations
          family={selectedFamily}
          onBack={() => setSelectedFamily(null)}
          onSelect={onSelect}
        />
      </div>
    );
  }

  return (
    <div className="opening-list-container">
      {/* Hero header */}
      <div className="opening-list-hero">
        <h1 className="opening-list-hero-title">Chess Opening Trainer</h1>
        <p className="opening-list-hero-sub">
          Study theory, then drill the moves. Master every opening from A00 to E99.
        </p>
        <div className="opening-list-stats">
          <div className="stat-item">
            <span className="stat-value">{total.toLocaleString()}</span>
            <span className="stat-label">Openings</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">500+</span>
            <span className="stat-label">Families</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">A–E</span>
            <span className="stat-label">ECO Groups</span>
          </div>
        </div>

        {/* Mode switcher */}
        <div className="ol-mode-tabs">
          <button
            id="mode-tab-top"
            className={`ol-mode-tab ${mode === 'top' ? 'ol-mode-tab--active' : ''}`}
            onClick={() => setMode('top')}
          >
            ★ Most Popular
          </button>
          <button
            id="mode-tab-popular"
            className={`ol-mode-tab ${mode === 'popular' ? 'ol-mode-tab--active' : ''}`}
            onClick={() => setMode('popular')}
          >
            ⊞ Classify Openings
          </button>
          <button
            id="mode-tab-browse"
            className={`ol-mode-tab ${mode === 'browse' ? 'ol-mode-tab--active' : ''}`}
            onClick={() => setMode('browse')}
          >
            ♟ Browse All
          </button>
        </div>
      </div>

      {/* ── Most Popular mode ── */}
      {mode === 'top' && (
        <MostPopularOpenings onSelect={onSelect} onSelectFamily={setSelectedFamily} />
      )}

      {/* ── Classify mode ── */}
      {mode === 'popular' && (
        <PopularOpenings onSelect={onSelect} onSelectFamily={setSelectedFamily} />
      )}

      {/* ── Browse-all mode ── */}
      {mode === 'browse' && (
        <>
          <div className="opening-list-controls">
            <div className="search-wrap">
              <span className="search-icon">⌕</span>
              <input
                id="opening-search"
                className="search-input"
                type="text"
                placeholder="Search openings… (e.g. Sicilian, King's Indian)"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              id="eco-filter"
              className="filter-select"
              value={ecoFilter}
              onChange={e => setEcoFilter(e.target.value)}
            >
              <option value="">All ECO Groups</option>
              {ECO_GROUPS.map(g => (
                <option key={g} value={g}>Group {g} ({g}00–{g}99)</option>
              ))}
            </select>
          </div>

          <div className="opening-list-body">
            {loading ? (
              <div className="loading-center">
                <div className="spinner" />
                <span>Loading openings database…</span>
              </div>
            ) : families.length === 0 ? (
              <div className="opening-list-empty">
                <div className="opening-list-empty-icon">♟</div>
                <strong>No openings found</strong>
                <span>Try a different search term or filter</span>
              </div>
            ) : (
              <div className="opening-groups">
                {families.map(family => (
                  <div key={family} className="opening-group">
                    <div className="opening-group-header">
                      <div className="opening-group-letter">
                        {family.charAt(0).toUpperCase()}
                      </div>
                      <span className="opening-group-name">{family}</span>
                      <span className="opening-group-count">{grouped[family].length} variation{grouped[family].length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="opening-cards">
                      {grouped[family].map((opening, i) => (
                        <button
                          key={`${opening.eco}-${i}`}
                          id={`opening-card-${opening.eco}-${i}`}
                          className="opening-card"
                          onClick={() => onSelect(opening)}
                        >
                          <div className="opening-card-top">
                            <span className="opening-card-name">{opening.name}</span>
                            <span className="badge badge-gold">{opening.eco}</span>
                          </div>
                          <div className="opening-card-moves">
                            {opening.moves.slice(0, 6).map((m, mi) => (
                              <span key={mi} className="move-chip">{m}</span>
                            ))}
                            {opening.moves.length > 6 && (
                              <span className="move-chip">+{opening.moves.length - 6}</span>
                            )}
                          </div>
                          <div className="opening-card-footer">
                            <span className="badge badge-accent">{opening.moves.length % 2 === 0 ? opening.moves.length / 2 : Math.ceil(opening.moves.length / 2)} moves</span>
                            <span className="opening-card-length">
                              {opening.moves.length} plies
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && totalPages > 1 && (
              <div className="opening-list-pagination">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  id="pagination-prev"
                >
                  ← Previous
                </button>
                <span className="pagination-info">Page {page} of {totalPages}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  id="pagination-next"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
