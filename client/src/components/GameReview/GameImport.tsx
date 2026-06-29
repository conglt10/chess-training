import { useRef, useState } from 'react';
import { importGameFromUrl } from '../../api/importGame';

interface Props {
  /** Called with a raw PGN string once the user picks a game to review. */
  onSubmit: (pgn: string) => void;
  /** Error bubbled up from the parent (e.g. PGN parse / analysis errors). */
  error?: string | null;
  busy?: boolean;
}

const SAMPLE_PGN = `[Event "Casual Game"]
[Site "London"]
[Date "1851.06.21"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]

1.e4 e5 2.f4 exf4 3.Bc4 Qh4+ 4.Kf1 b5 5.Bxb5 Nf6 6.Nf3 Qh6 7.d3 Nh5 8.Nh4 Qg5
9.Nf5 c6 10.g4 Nf6 11.Rg1 cxb5 12.h4 Qg6 13.h5 Qg5 14.Qf3 Ng8 15.Bxf4 Qf6
16.Nc3 Bc5 17.Nd5 Qxb2 18.Bd6 Bxg1 19.e5 Qxa1+ 20.Ke2 Na6 21.Nxg7+ Kd8
22.Qf6+ Nxf6 23.Be7# 1-0`;

export default function GameImport({ onSubmit, error, busy }: Props) {
  const [url, setUrl] = useState('');
  const [pgn, setPgn] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shownError = localError ?? error ?? null;

  const handleUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setLocalError('Paste a chess.com or lichess game link first.'); return; }
    setLocalError(null);
    setUrlLoading(true);
    try {
      const game = await importGameFromUrl(trimmed);
      onSubmit(game.pgn);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not import that link.');
    } finally {
      setUrlLoading(false);
    }
  };

  const handlePgn = () => {
    setLocalError(null);
    if (!pgn.trim()) { setLocalError('Paste a PGN first.'); return; }
    onSubmit(pgn);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setPgn(text);
      setLocalError(null);
    };
    reader.onerror = () => setLocalError('Could not read that file.');
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="review-import">
      <div className="review-import-card glass">
        <h2 className="review-import-title">🔍 Game Review</h2>
        <p className="review-import-sub">
          Import a game and get a chess.com-style report: every move classified, accuracy scores,
          an evaluation graph, and coaching for each move.
        </p>

        {/* URL import */}
        <label className="review-field-label">Paste a chess.com or lichess link</label>
        <div className="review-url-row">
          <input
            className="review-url-input"
            type="text"
            placeholder="https://lichess.org/… or https://www.chess.com/game/live/…"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleUrl(); }}
            disabled={busy || urlLoading}
          />
          <button className="btn btn-primary" onClick={handleUrl} disabled={busy || urlLoading}>
            {urlLoading ? 'Loading…' : 'Import'}
          </button>
        </div>

        <div className="review-divider"><span>or paste PGN</span></div>

        {/* PGN paste */}
        <textarea
          className="review-pgn-input"
          placeholder={SAMPLE_PGN}
          value={pgn}
          onChange={e => setPgn(e.target.value)}
          disabled={busy}
          spellCheck={false}
        />

        <div className="review-import-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            📁 Upload .pgn file
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setPgn(SAMPLE_PGN); setLocalError(null); }} disabled={busy}>
            ✨ Try a sample game
          </button>
          <div className="review-import-spacer" />
          <button className="btn btn-primary" onClick={handlePgn} disabled={busy}>
            Review game →
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pgn,text/plain"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
        </div>

        {shownError && <div className="review-import-error">⚠ {shownError}</div>}
      </div>
    </div>
  );
}
