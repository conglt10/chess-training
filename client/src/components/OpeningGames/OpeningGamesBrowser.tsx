import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Collection } from '../../types';
import { fetchCollections } from '../../api/masterGames';
import { avatarGradient } from '../MastersMode/legendAvatar';
import { openingGamesPath } from '../../paths';
import CollectionGamesList from '../MastersMode/CollectionGamesList';
import '../MastersMode/MastersMode.css';
import './OpeningGames.css';

type Filter = 'all' | 'popular' | 'e4' | 'd4' | 'other';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'popular', label: '⭐ Most Popular' },
  { key: 'e4', label: '♙ King Pawn' },
  { key: 'd4', label: '♟ Queen Pawn' },
  { key: 'other', label: 'Other' },
];

const GROUP_BADGE: Record<string, string> = { e4: '1.e4', d4: '1.d4', other: '✦' };

function matches(c: Collection, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'popular') return !!c.popular;
  return c.group === filter;
}

export default function OpeningGamesBrowser() {
  const navigate = useNavigate();
  const { openingKey } = useParams();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchCollections().then(setCollections).catch(() => setCollections([]));
  }, []);

  const openings = useMemo(() => collections.filter(c => c.category === 'opening'), [collections]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return openings.filter(c => matches(c, filter) && (!q || c.label.toLowerCase().includes(q)));
  }, [openings, filter, search]);

  // Detail view — games list for one opening.
  if (openingKey) {
    const label = openings.find(c => c.key === openingKey)?.label ?? collections.find(c => c.key === openingKey)?.label ?? openingKey;
    return (
      <div className="opening-games">
        <CollectionGamesList
          collectionKey={openingKey}
          title={label}
          backTo={openingGamesPath()}
          backLabel="← All openings"
        />
      </div>
    );
  }

  return (
    <div className="opening-games">
      <div className="masters-intro">
        <div className="masters-intro-text">
          <h2>Practice by Opening</h2>
          <p>Pick an opening and play through real games — guess the moves and review, just like Masters mode.</p>
        </div>
      </div>

      <div className="og-controls">
        <div className="og-filters">
          {FILTERS.map(f => (
            <button key={f.key} className={`masters-tab ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="masters-search-input og-search"
          placeholder="Search openings…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {shown.length === 0 ? (
        <div className="masters-empty">No openings match.</div>
      ) : (
        <div className="masters-collections">
          {shown.map(c => (
            <button key={c.key} className="masters-collection-card glass" onClick={() => navigate(openingGamesPath(c.key))}>
              <span className="masters-avatar og-avatar" style={{ background: avatarGradient(c.key) }}>
                {GROUP_BADGE[c.group ?? 'other']}
              </span>
              <span className="masters-collection-name">{c.label}</span>
              <span className="masters-collection-count">{c.count.toLocaleString()} games{c.popular ? ' · ⭐' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
