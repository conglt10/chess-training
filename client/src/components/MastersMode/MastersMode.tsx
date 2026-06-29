import { useEffect, useRef, useState } from 'react';
import { Opening, ThemeConfig } from '../../types';
import { fetchOpenings } from '../../api/openings';
import { sanLineToUci } from '../../utils/sanToUci';
import MasterExplorer from './MasterExplorer';
import MasterGuessTrainer from './MasterGuessTrainer';
import PlayerBrowser from './PlayerBrowser';
import './MastersMode.css';

interface MastersModeProps {
  theme: ThemeConfig;
}

type Tab = 'players' | 'explore';

export default function MastersMode({ theme }: MastersModeProps) {
  const [tab, setTab] = useState<Tab>('players');

  // Explorer line (UCI), shared with the drill prefix.
  const [line, setLine] = useState<string[]>([]);
  const [drill, setDrill] = useState<{ gameId: string; startLine: string[]; heroName?: string } | null>(null);

  // Opening quick-jump search (explorer tab).
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Opening[]>([]);
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    const term = search.trim();
    if (!term) { setResults([]); return; }
    const timer = setTimeout(() => {
      fetchOpenings({ search: term, pageSize: 8 })
        .then(res => { if (searchRef.current.trim() === term) setResults(res.openings); })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const seedFromOpening = (o: Opening) => {
    setLine(sanLineToUci(o.moves));
    setSearch('');
    setResults([]);
  };

  if (drill) {
    return (
      <MasterGuessTrainer
        theme={theme}
        gameId={drill.gameId}
        startLine={drill.startLine}
        heroName={drill.heroName}
        onBack={() => setDrill(null)}
      />
    );
  }

  return (
    <div className="masters-mode">
      <div className="masters-intro">
        <div className="masters-intro-text">
          <h2>Train with Master Games</h2>
          <p>Pick a legendary champion and guess their moves in real games, or explore how strong players handle any opening.</p>
        </div>
      </div>

      <div className="masters-tabs">
        <button className={`masters-tab ${tab === 'players' ? 'active' : ''}`} onClick={() => setTab('players')}>👑 Legendary Players</button>
        <button className={`masters-tab ${tab === 'explore' ? 'active' : ''}`} onClick={() => setTab('explore')}>♟ Explore Openings</button>
      </div>

      {tab === 'players' ? (
        <PlayerBrowser onPickGame={(id, heroName) => setDrill({ gameId: id, startLine: [], heroName })} />
      ) : (
        <>
          <div className="masters-jump">
            <input
              className="masters-jump-input"
              placeholder="Jump to an opening… (e.g. Sicilian, Italian Game)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {results.length > 0 && (
              <div className="masters-jump-results glass">
                {results.map((o, i) => (
                  <button key={`${o.eco}-${o.name}-${i}`} className="masters-jump-row" onClick={() => seedFromOpening(o)}>
                    <span className="badge badge-gold">{o.eco}</span>
                    <span className="masters-jump-name">{o.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <MasterExplorer
            theme={theme}
            line={line}
            onAppendMove={uci => setLine(prev => [...prev, uci])}
            onUndo={() => setLine(prev => prev.slice(0, -1))}
            onResetLine={() => setLine([])}
            onPickGame={id => setDrill({ gameId: id, startLine: line })}
          />
        </>
      )}
    </div>
  );
}
