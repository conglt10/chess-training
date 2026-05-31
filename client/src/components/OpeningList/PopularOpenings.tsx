import { useState, useEffect, useCallback } from 'react';
import './PopularOpenings.css';
import { Opening } from '../../types';
import type { FamilySummary, FirstMoveTab } from '../../types';
import { fetchFamilySummaries, fetchOpenings } from '../../api/openings';

interface PopularOpeningsProps {
  onSelect: (opening: Opening) => void;
  onFamilySelect: (family: string, variations: Opening[], color: string) => void;
}

type FirstMove = '1.e4' | '1.d4' | 'Other';
const TAB_API: Record<FirstMove, FirstMoveTab> = { '1.e4': 'e4', '1.d4': 'd4', Other: 'other' };

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

const FAMILIES_PER_PAGE = 20;

export default function PopularOpenings({ onSelect, onFamilySelect }: PopularOpeningsProps) {
  const [activeTab, setActiveTab] = useState<FirstMove>('1.e4');
  const [search, setSearch] = useState('');
  const [familyPage, setFamilyPage] = useState(1);

  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [tabCounts, setTabCounts] = useState<Record<FirstMoveTab, number>>({ e4: 0, d4: 0, other: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingVariations, setLoadingVariations] = useState<string | null>(null);

  // Load paginated family summaries from backend
  const load = useCallback(async (
    tab: FirstMove,
    q: string,
    page: number,
  ) => {
    setLoading(true);
    try {
      const data = await fetchFamilySummaries({
        firstMove: TAB_API[tab],
        search: q,
        page,
        pageSize: FAMILIES_PER_PAGE,
      });
      setFamilies(data.families);
      setTotal(data.total);
      setTabCounts(data.tabCounts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced reload on filter/page/tab change
  useEffect(() => {
    const t = setTimeout(() => load(activeTab, search, familyPage), 250);
    return () => clearTimeout(t);
  }, [activeTab, search, familyPage, load]);

  // Reset page on tab or search change
  useEffect(() => { setFamilyPage(1); }, [activeTab, search]);

  // When a family row is clicked, load its variations then hand off to parent
  const handleFamilyClick = useCallback(async (summary: FamilySummary, color: string) => {
    setLoadingVariations(summary.name);
    try {
      const data = await fetchOpenings({ family: summary.name, pageSize: 500 });
      onFamilySelect(summary.name, data.openings, color);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingVariations(null);
    }
  }, [onFamilySelect]);

  const totalPages = Math.ceil(total / FAMILIES_PER_PAGE);
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
              <span className="popular-tab-count">
                {tabCounts[TAB_API[tab]].toLocaleString()}
              </span>
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
            {loading ? '…' : tabCounts[TAB_API[activeTab]].toLocaleString()}
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
        ) : families.length === 0 ? (
          <div className="opening-list-empty">
            <div className="opening-list-empty-icon">♟</div>
            <strong>No families found</strong>
            <span>Try a different search term</span>
          </div>
        ) : (
          <div className="popular-families">
            {families.map(summary => (
              <div key={summary.name} className="popular-family">
                <button
                  id={`family-${summary.name.replace(/\s+/g, '-').toLowerCase()}`}
                  className="popular-family-header"
                  style={{ '--tab-color': meta.color } as React.CSSProperties}
                  disabled={loadingVariations === summary.name}
                  onClick={() => handleFamilyClick(summary, meta.color)}
                >
                  <div className="popular-family-letter" style={{ background: meta.color }}>
                    {loadingVariations === summary.name ? '…' : summary.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="popular-family-info">
                    <span className="popular-family-name">{summary.name}</span>
                    <span className="popular-family-hint">
                      {summary.previewMoves.join(' ')}
                      {summary.previewMoves.length === 4 ? ' …' : ''}
                    </span>
                  </div>
                  <span className="popular-family-count">
                    {summary.count} variation{summary.count !== 1 ? 's' : ''}
                  </span>
                  <span className="popular-family-chevron">›</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="opening-list-pagination">
            <button
              className="btn btn-ghost btn-sm"
              disabled={familyPage === 1}
              onClick={() => setFamilyPage(p => p - 1)}
            >
              ← Previous
            </button>
            <span className="pagination-info">
              Page {familyPage} of {totalPages}
              <span className="pagination-total"> ({total} families)</span>
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={familyPage === totalPages}
              onClick={() => setFamilyPage(p => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
