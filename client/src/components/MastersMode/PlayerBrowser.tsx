import { useEffect, useState } from 'react';
import { Collection, MasterGameSummary } from '../../types';
import { fetchCollections, fetchCollectionGames } from '../../api/masterGames';
import { avatarInitials, avatarGradient, avatarImage } from './legendAvatar';
import './MastersMode.css';

interface PlayerBrowserProps {
  onPickGame: (id: string, heroName: string) => void;
}

const PAGE_SIZE = 10;

function Avatar({ label, collectionKey, size = 56 }: { label: string; collectionKey: string; size?: number }) {
  const img = avatarImage(collectionKey);
  if (img) {
    return (
      <img
        className="masters-avatar masters-avatar-img"
        src={img}
        alt={label}
        loading="lazy"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="masters-avatar"
      style={{ width: size, height: size, background: avatarGradient(collectionKey), fontSize: size * 0.36 }}
    >
      {avatarInitials(label, collectionKey)}
    </span>
  );
}

// A player name prefixed with its piece-colour chip.
function Side({ name, elo, color }: { name: string; elo: number | null; color: 'w' | 'b' }) {
  return (
    <span className="masters-side">
      <span className={`pc pc-${color}`} aria-hidden />
      <strong>{name}</strong>{elo ? <span className="masters-elo"> ({elo})</span> : null}
    </span>
  );
}

export default function PlayerBrowser({ onPickGame }: PlayerBrowserProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Collection | null>(null);
  const [games, setGames] = useState<MasterGameSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCollections().then(setCollections).catch(() => setCollections([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    fetchCollectionGames({ key: selected.key, page, pageSize: PAGE_SIZE })
      .then(res => { if (!cancelled) { setGames(res.games); setTotal(res.total); } })
      .catch(() => { if (!cancelled) setGames([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected, page]);

  const openCollection = (c: Collection) => { setSelected(c); setPage(1); setGames([]); };

  if (!selected) {
    return (
      <div className="masters-collections">
        {collections.map(c => (
          <button key={c.key} className="masters-collection-card glass" onClick={() => openCollection(c)}>
            <Avatar label={c.label} collectionKey={c.key} />
            <span className="masters-collection-name">{c.label}</span>
            <span className="masters-collection-count">{c.count.toLocaleString()} games</span>
          </button>
        ))}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="masters-collection-detail">
      <div className="masters-collection-detail-head">
        <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>← All players</button>
        <Avatar label={selected.label} collectionKey={selected.key} size={40} />
        <h3>{selected.label}</h3>
        <span className="badge badge-accent">{total.toLocaleString()} games</span>
      </div>

      {loading && games.length === 0 ? (
        <div className="masters-empty">Loading games…</div>
      ) : (
        <div className="masters-game-list-1col">
          {games.map(g => (
            <button key={g.id} className="masters-game-row" onClick={() => onPickGame(g.id, selected.label)}>
              <span className="masters-game-sides">
                <Side name={g.white} elo={g.whiteElo} color="w" />
                <span className="masters-vs">vs</span>
                <Side name={g.black} elo={g.blackElo} color="b" />
              </span>
              <span className="masters-game-meta">
                {g.event ? <span className="masters-game-event">{g.event}</span> : null}
                <span className="masters-game-year">{g.year ?? ''}</span>
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
