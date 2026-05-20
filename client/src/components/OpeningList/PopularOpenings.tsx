import { useState, useEffect, useMemo } from 'react';
import './PopularOpenings.css';
import { Opening } from '../../types';
import { fetchOpenings } from '../../api/openings';

interface PopularOpeningsProps {
  onSelect: (opening: Opening) => void;
}

type FirstMove = '1.e4' | '1.d4' | 'Other';

const TABS: FirstMove[] = ['1.e4', '1.d4', 'Other'];

const TAB_META: Record<FirstMove, { icon: string; desc: string; color: string }> = {
  '1.e4': {
    icon: '♙',
    desc: 'King Pawn openings — the most classical and tactical',
    color: 'var(--accent)',
  },
  '1.d4': {
    icon: '♟',
    desc: 'Queen Pawn openings — positional and strategic battles',
    color: '#f59e0b',
  },
  Other: {
    icon: '♞',
    desc: 'Flank openings, irregular and hypermodern systems',
    color: '#10b981',
  },
};

function classifyFirstMove(opening: Opening): FirstMove {
  const first = opening.moves[0]?.toLowerCase();
  if (first === 'e4') return '1.e4';
  if (first === 'd4') return '1.d4';
  return 'Other';
}

export default function PopularOpenings({ onSelect }: PopularOpeningsProps) {
  const [allOpenings, setAllOpenings] = useState<Opening[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FirstMove>('1.e4');
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Load all openings (large page size)
    fetchOpenings({ pageSize: 100, page: 1 })
      .then(async (page1) => {
        if (cancelled) return;
        const total = page1.total;
        const pages = Math.ceil(total / 100);
        let all = [...page1.openings];
        for (let p = 2; p <= pages; p++) {
          const more = await fetchOpenings({ pageSize: 100, page: p });
          if (cancelled) return;
          all = [...all, ...more.openings];
        }
        setAllOpenings(all);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Reset expanded family when tab changes
  useEffect(() => {
    setExpandedFamily(null);
    setSearch('');
  }, [activeTab]);

  const grouped = useMemo(() => {
    const inTab = allOpenings.filter(o => classifyFirstMove(o) === activeTab);
    const result: Record<string, Opening[]> = {};
    for (const o of inTab) {
      const key = o.family;
      if (!result[key]) result[key] = [];
      result[key].push(o);
    }
    return result;
  }, [allOpenings, activeTab]);

  const filteredFamilies = useMemo(() => {
    const lower = search.toLowerCase();
    return Object.keys(grouped)
      .filter(f => !lower || f.toLowerCase().includes(lower))
      .sort();
  }, [grouped, search]);

  const tabCounts = useMemo<Record<FirstMove, number>>(() => {
    const counts: Record<FirstMove, number> = { '1.e4': 0, '1.d4': 0, Other: 0 };
    for (const o of allOpenings) {
      counts[classifyFirstMove(o)]++;
    }
    return counts;
  }, [allOpenings]);

  const meta = TAB_META[activeTab];

  return (
    <div className="popular-container">
      {/* Tab bar */}
      <div className="popular-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            id={`popular-tab-${tab.replace('.', '-')}`}
            className={`popular-tab ${activeTab === tab ? 'popular-tab--active' : ''}`}
            style={{ '--tab-color': TAB_META[tab].color } as React.CSSProperties}
            onClick={() => setActiveTab(tab)}
          >
            <span className="popular-tab-icon">{TAB_META[tab].icon}</span>
            <span className="popular-tab-label">{tab}</span>
            {!loading && (
              <span className="popular-tab-count">{tabCounts[tab].toLocaleString()}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab header */}
      <div className="popular-tab-header" style={{ '--tab-color': meta.color } as React.CSSProperties}>
        <div className="popular-tab-header-icon">{meta.icon}</div>
        <div>
          <h2 className="popular-tab-header-title">{activeTab} Openings</h2>
          <p className="popular-tab-header-desc">{meta.desc}</p>
        </div>
        <div className="popular-tab-header-stat">
          <span className="stat-value" style={{ color: meta.color }}>
            {loading ? '…' : tabCounts[activeTab].toLocaleString()}
          </span>
          <span className="stat-label">Variations</span>
        </div>
      </div>

      {/* Family search */}
      <div className="popular-family-search">
        <span className="search-icon">⌕</span>
        <input
          className="search-input"
          type="text"
          placeholder={`Search within ${activeTab} openings…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Body */}
      <div className="popular-body">
        {loading ? (
          <div className="loading-center">
            <div className="spinner" />
            <span>Loading openings database…</span>
          </div>
        ) : filteredFamilies.length === 0 ? (
          <div className="opening-list-empty">
            <div className="opening-list-empty-icon">♟</div>
            <strong>No families found</strong>
            <span>Try a different search term</span>
          </div>
        ) : (
          <div className="popular-families">
            {filteredFamilies.map(family => {
              const variations = grouped[family];
              const isExpanded = expandedFamily === family;
              return (
                <div key={family} className={`popular-family ${isExpanded ? 'popular-family--expanded' : ''}`}>
                  <button
                    id={`family-${family.replace(/\s+/g, '-').toLowerCase()}`}
                    className="popular-family-header"
                    style={{ '--tab-color': meta.color } as React.CSSProperties}
                    onClick={() => setExpandedFamily(isExpanded ? null : family)}
                  >
                    <div className="popular-family-letter" style={{ background: meta.color }}>
                      {family.charAt(0).toUpperCase()}
                    </div>
                    <div className="popular-family-info">
                      <span className="popular-family-name">{family}</span>
                      <span className="popular-family-hint">
                        {variations[0]?.moves.slice(0, 4).join(' ')}
                        {variations[0]?.moves.length > 4 ? ' …' : ''}
                      </span>
                    </div>
                    <span className="popular-family-count">
                      {variations.length} variation{variations.length !== 1 ? 's' : ''}
                    </span>
                    <span className={`popular-family-chevron ${isExpanded ? 'popular-family-chevron--open' : ''}`}>
                      ›
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="popular-variations">
                      {variations.map((opening, i) => (
                        <button
                          key={`${opening.eco}-${i}`}
                          id={`variation-${opening.eco}-${i}`}
                          className="popular-variation-card"
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
