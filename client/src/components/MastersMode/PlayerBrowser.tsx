import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Collection } from '../../types';
import { fetchCollections } from '../../api/masterGames';
import { avatarInitials, avatarGradient, avatarImage } from './legendAvatar';
import { mastersPlayersPath } from '../../paths';
import CollectionGamesList from './CollectionGamesList';
import './MastersMode.css';

function Avatar({ label, collectionKey, size = 56 }: { label: string; collectionKey: string; size?: number }) {
  const img = avatarImage(collectionKey);
  if (img) {
    return (
      <img className="masters-avatar masters-avatar-img" src={img} alt={label} loading="lazy" style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="masters-avatar" style={{ width: size, height: size, background: avatarGradient(collectionKey), fontSize: size * 0.36 }}>
      {avatarInitials(label, collectionKey)}
    </span>
  );
}

export default function PlayerBrowser() {
  const navigate = useNavigate();
  const { collectionKey } = useParams();
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    fetchCollections().then(setCollections).catch(() => setCollections([]));
  }, []);

  // Legendary players + Elite — exclude opening collections (those live under /repertoire/games).
  const players = collections.filter(c => c.category !== 'opening');
  const selected = collectionKey ? collections.find(c => c.key === collectionKey) ?? null : null;

  if (collectionKey) {
    const label = selected?.label ?? collectionKey;
    return (
      <CollectionGamesList
        collectionKey={collectionKey}
        title={label}
        leading={<Avatar label={label} collectionKey={collectionKey} size={40} />}
        backTo={mastersPlayersPath()}
        backLabel="← All players"
        gameHero={label}
      />
    );
  }

  return (
    <div className="masters-collections">
      {players.map(c => (
        <button key={c.key} className="masters-collection-card glass" onClick={() => navigate(mastersPlayersPath(c.key))}>
          <Avatar label={c.label} collectionKey={c.key} />
          <span className="masters-collection-name">{c.label}</span>
          <span className="masters-collection-count">{c.count.toLocaleString()} games</span>
        </button>
      ))}
    </div>
  );
}
