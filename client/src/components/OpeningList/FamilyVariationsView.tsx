import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Opening } from '../../types';
import { openingPath } from '../../paths';
import './FamilyVariationsView.css';

interface FamilyVariationsViewProps {
  family: string;
  variations: Opening[];
  color: string;
  onBack: () => void;
}

type SortKey = 'default' | 'moves-asc' | 'moves-desc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default', label: 'Default order' },
  { key: 'moves-desc', label: 'Most moves' },
  { key: 'moves-asc', label: 'Fewest moves' },
];

export default function FamilyVariationsView({
  family,
  variations,
  color,
  onBack,
}: FamilyVariationsViewProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('default');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? variations.filter(o => o.name.toLowerCase().includes(q) || o.eco.toLowerCase().includes(q))
      : variations;
    if (sortKey !== 'default') {
      const dir = sortKey === 'moves-asc' ? 1 : -1;
      list = [...list].sort((a, b) => dir * (a.moves.length - b.moves.length));
    }
    return list;
  }, [variations, search, sortKey]);

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
            {search.trim()
              ? `${shown.length} of ${variations.length} variations`
              : `${variations.length} variation${variations.length !== 1 ? 's' : ''} — click any to study`}
          </p>
        </div>
        <div className="fvv-count-badge" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}>
          {variations.length}
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
        {shown.length === 0 ? (
          <div className="fvv-empty">No variations match “{search.trim()}”.</div>
        ) : (
        <div className="fvv-grid">
          {shown.map((opening, i) => (
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
    </div>
  );
}
