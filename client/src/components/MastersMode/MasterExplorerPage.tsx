import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Opening } from '../../types';
import { fetchOpenings } from '../../api/openings';
import { sanLineToUci } from '../../utils/sanToUci';
import { masterGamePath } from '../../paths';
import MasterExplorer from './MasterExplorer';
import type { MastersOutletCtx } from './MastersMode';
import './MastersMode.css';

function parseLine(s: string | null): string[] {
  return s ? s.split(',').map(x => x.trim()).filter(Boolean) : [];
}

export default function MasterExplorerPage() {
  const { theme } = useOutletContext<MastersOutletCtx>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const line = parseLine(params.get('line'));

  // Pushes a new history entry so the browser Back button steps through the line.
  const setLine = (next: string[]) => setParams(next.length ? { line: next.join(',') } : {});

  // Opening quick-jump search.
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

  return (
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
        onAppendMove={uci => setLine([...line, uci])}
        onUndo={() => setLine(line.slice(0, -1))}
        onResetLine={() => setLine([])}
        onPickGame={id => navigate(masterGamePath(id, { line }))}
      />
    </>
  );
}
