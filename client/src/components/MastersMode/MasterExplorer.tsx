import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { ExplorerResult, ThemeConfig } from '../../types';
import { fetchExplorer } from '../../api/masterGames';
import { useBoardSize } from '../../hooks/useBoardSize';
import ChessBoard from '../Board/ChessBoard';
import MoveTable from '../MoveTable/MoveTable';
import './MastersMode.css';

interface MasterExplorerProps {
  theme: ThemeConfig;
  line: string[];                       // UCI moves played so far
  onAppendMove: (uci: string) => void;
  onUndo: () => void;
  onResetLine: () => void;
  onPickGame: (id: string) => void;
}

const PAGE_SIZE = 10;

function Side({ name, elo, color }: { name: string; elo: number | null; color: 'w' | 'b' }) {
  return (
    <span className="masters-side">
      <span className={`pc pc-${color}`} aria-hidden />
      <strong>{name}</strong>{elo ? <span className="masters-elo"> ({elo})</span> : null}
    </span>
  );
}

// Replay a UCI line into SAN for the move table.
function lineToSan(line: string[]): string[] {
  const chess = new Chess();
  const san: string[] = [];
  for (const uci of line) {
    try {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
      if (!m) break;
      san.push(m.san);
    } catch { break; }
  }
  return san;
}

export default function MasterExplorer({ theme, line, onAppendMove, onUndo, onResetLine, onPickGame }: MasterExplorerProps) {
  const [data, setData] = useState<ExplorerResult | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const { ref: boardAreaRef, size: boardSize } = useBoardSize(56, 360, 640);

  // Reset to first page whenever the line changes.
  useEffect(() => { setPage(1); }, [line]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchExplorer({ play: line, page, pageSize: PAGE_SIZE })
      .then(res => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [line, page]);

  const fen = data?.fen ?? new Chess().fen();
  const sanLine = useMemo(() => lineToSan(line), [line]);

  // Highlight the most recent move of the current line.
  const moveHighlights = useMemo(() => {
    const last = line[line.length - 1];
    return last
      ? [{ from: last.slice(0, 2), to: last.slice(2, 4), color: 'rgba(246, 192, 0, 0.45)' }]
      : [];
  }, [line]);

  // Make a move on the board → append its UCI to the line.
  const handleMove = (from: string, to: string, promotion?: string): boolean => {
    try {
      const chess = new Chess(fen);
      const m = chess.move({ from, to, promotion: promotion || 'q' });
      if (!m) return false;
      onAppendMove(m.from + m.to + (m.promotion ?? ''));
      return true;
    } catch { return false; }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="masters-explorer">
      <div className="masters-board-area" ref={boardAreaRef}>
        <div className="masters-board-wrap">
          <ChessBoard fen={fen} theme={theme} interactive onMove={handleMove} boardWidth={boardSize} moveHighlights={moveHighlights} />
        </div>
        <div className="masters-line-controls">
          <button className="btn btn-ghost btn-sm" onClick={onUndo} disabled={line.length === 0}>↩ Undo move</button>
          <button className="btn btn-ghost btn-sm" onClick={onResetLine} disabled={line.length === 0}>⏮ Start position</button>
        </div>
      </div>

      <div className="masters-sidebar">
        <div className="masters-panel glass masters-line-panel">
          <div className="masters-panel-title">📋 Current line</div>
          <MoveTable moves={sanLine} currentMoveIndex={sanLine.length} />
        </div>

        <div className="masters-panel glass">
          <div className="masters-panel-title">
            ♟ Master moves {data ? <span className="badge badge-accent">{data.totalGames} games</span> : null}
          </div>
          {loading && !data ? (
            <div className="masters-empty">Loading…</div>
          ) : data && data.moves.length > 0 ? (
            <div className="masters-move-list">
              {data.moves.map(m => {
                const total = m.gameCount || 1;
                const w = Math.round((m.whiteWins / total) * 100);
                const d = Math.round((m.draws / total) * 100);
                const b = 100 - w - d;
                return (
                  <button key={m.uci} className="masters-move-row" onClick={() => onAppendMove(m.uci)}>
                    <span className="masters-move-san">{m.san}</span>
                    <span className="masters-move-count">{m.gameCount}</span>
                    <span className="masters-wdl" title={`White ${m.whiteWins} / Draw ${m.draws} / Black ${m.blackWins}`}>
                      <span className="wdl-w" style={{ width: `${w}%` }}>{w > 12 ? `${w}%` : ''}</span>
                      <span className="wdl-d" style={{ width: `${d}%` }}>{d > 12 ? `${d}%` : ''}</span>
                      <span className="wdl-b" style={{ width: `${b}%` }}>{b > 12 ? `${b}%` : ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="masters-empty">No master games reach this position. Pick a game above or undo a move.</div>
          )}
        </div>

        <div className="masters-panel glass">
          <div className="masters-panel-title">📜 Master games</div>
          {data && data.games.length > 0 ? (
            <>
              <div className="masters-game-list-1col">
                {data.games.map(g => (
                  <button key={g.id} className="masters-game-row" onClick={() => onPickGame(g.id)}>
                    <span className="masters-game-sides">
                      <Side name={g.white} elo={g.whiteElo} color="w" />
                      <span className="masters-vs">vs</span>
                      <Side name={g.black} elo={g.blackElo} color="b" />
                    </span>
                    <span className="masters-game-meta">
                      <span className={`masters-result result-${g.result === '1-0' ? 'w' : g.result === '0-1' ? 'b' : 'd'}`}>{g.result}</span>
                      <span className="masters-game-year">{g.year ?? ''}</span>
                    </span>
                  </button>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="masters-pager">
                  <button className="masters-pager-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹ Prev</button>
                  <span className="masters-pager-info">Page <strong>{page}</strong> of {totalPages}</span>
                  <button className="masters-pager-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next ›</button>
                </div>
              )}
            </>
          ) : (
            <div className="masters-empty">No games to show.</div>
          )}
        </div>
      </div>
    </div>
  );
}
