import { useState, useMemo } from 'react';
import { Opening } from '../../types';
import './FamilyVariations.css';

interface FamilyVariationsProps {
  family: {
    name: string;
    variations: Opening[];
    description?: string;
    badge?: string;
    color?: string;
    icon?: string;
  };
  onBack: () => void;
  onSelect: (opening: Opening) => void;
}

export default function FamilyVariations({ family, onBack, onSelect }: FamilyVariationsProps) {
  const [search, setSearch] = useState('');
  const { name, variations, description, badge, color = 'var(--accent)', icon = '♟' } = family;

  // Filter variations based on search input
  const filteredVariations = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return variations;
    return variations.filter(
      v =>
        v.name.toLowerCase().includes(query) ||
        v.eco.toLowerCase().includes(query) ||
        v.moves.join(' ').toLowerCase().includes(query)
    );
  }, [variations, search]);

  return (
    <div className="fv-container" style={{ '--fv-theme-color': color } as React.CSSProperties}>
      {/* Top Navigation / Header */}
      <div className="fv-nav-bar">
        <button className="fv-back-btn" onClick={onBack} id="fv-back-button">
          <svg
            className="fv-back-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to Openings
        </button>
      </div>

      {/* Hero Header Section */}
      <div className="fv-hero">
        <div className="fv-hero-content">
          <div className="fv-hero-left">
            <div className="fv-hero-icon-container">
              <span className="fv-hero-icon">{icon}</span>
            </div>
            <div className="fv-hero-details">
              <div className="fv-title-row">
                <h1 className="fv-hero-title" id="fv-family-title">{name}</h1>
                {badge && (
                  <span className="fv-hero-badge">
                    {badge}
                  </span>
                )}
              </div>
              {description && <p className="fv-hero-desc">{description}</p>}
            </div>
          </div>
          <div className="fv-hero-stat">
            <span className="fv-stat-value">{variations.length}</span>
            <span className="fv-stat-label">Total Variations</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="fv-controls">
        <div className="fv-search-wrap">
          <span className="fv-search-icon">⌕</span>
          <input
            id="fv-search-input"
            className="fv-search-input"
            type="text"
            placeholder={`Search variations in ${name}... (e.g. ${variations[0]?.eco || 'ECO'})`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Variations Grid */}
      <div className="fv-body">
        {filteredVariations.length === 0 ? (
          <div className="opening-list-empty">
            <div className="opening-list-empty-icon">♟</div>
            <strong>No variations matched your search</strong>
            <span>Try typing a different name, ECO code, or move sequence</span>
          </div>
        ) : (
          <div className="fv-grid">
            {filteredVariations.map((opening, idx) => (
              <button
                key={`${opening.eco}-${idx}`}
                id={`fv-var-card-${opening.eco}-${idx}`}
                className="fv-card"
                onClick={() => onSelect(opening)}
              >
                <div className="opening-card-top">
                  <span className="opening-card-name">{opening.name}</span>
                  <span className="badge badge-gold">{opening.eco}</span>
                </div>
                <div className="opening-card-moves">
                  {opening.moves.slice(0, 8).map((m, mi) => (
                    <span key={mi} className="move-chip">{m}</span>
                  ))}
                  {opening.moves.length > 8 && (
                    <span className="move-chip">+{opening.moves.length - 8}</span>
                  )}
                </div>
                <div className="opening-card-footer">
                  <span className="badge badge-accent">
                    {Math.ceil(opening.moves.length / 2)} moves
                  </span>
                  <span className="opening-card-length">{opening.moves.length} plies</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
