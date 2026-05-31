import { useRef, useEffect, useState, useCallback } from 'react';
import './CoachGame.css';
import ChessBoard from '../Board/ChessBoard';
import { useCoachGame } from '../../hooks/useCoachGame';
import type { CoachMoveEntry } from '../../hooks/useCoachGame';
import type { ThemeConfig } from '../../types';
import type { CoachLevel } from '../../utils/chessAI';
import { COACH_LEVELS } from '../../utils/chessAI';
import type { MoveQuality } from '../../utils/moveCommentator';

// ── Quality display helpers ────────────────────────────────────────────────────

const QUALITY_COLOR: Record<MoveQuality, string> = {
  brilliant: '#a78bfa',
  great:     '#4ade80',
  good:      '#94a3b8',
  book:      '#64748b',
  inaccuracy:'#fbbf24',
  mistake:   '#fb923c',
  blunder:   '#f87171',
};

const QUALITY_LABEL: Record<MoveQuality, string> = {
  brilliant: 'Brilliant !!',
  great:     'Great !',
  good:      'Good',
  book:      'Book',
  inaccuracy:'Inaccuracy ?!',
  mistake:   'Mistake ?',
  blunder:   'Blunder ??',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function MoveRow({ entry, isActive, onClick }: { entry: CoachMoveEntry; isActive: boolean; onClick: () => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { san, color, comment } = entry;
  const quality = comment?.quality;

  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isActive]);

  return (
    <div
      ref={rowRef}
      className={`coach-move-row ${comment ? `quality-${quality}` : 'coach-move'}${isActive ? ' nav-active' : ''}`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <div className="coach-move-san-line">
        <span
          className="coach-move-san"
          style={quality ? { color: QUALITY_COLOR[quality] } : undefined}
        >
          {color === 'w' ? '⬜' : '⬛'} {san}
          {comment?.symbol && (
            <span className="coach-move-symbol" style={{ color: QUALITY_COLOR[quality!] }}>
              {comment.symbol}
            </span>
          )}
        </span>
        {quality && (
          <span
            className="coach-move-badge"
            style={{ background: QUALITY_COLOR[quality] + '22', color: QUALITY_COLOR[quality] }}
          >
            {QUALITY_LABEL[quality]}
          </span>
        )}
      </div>

      {comment && (
        <div className="coach-comment-block">
          <p className="coach-comment-text">{comment.text}</p>
          {comment.bestAlternative && (
            <p className="coach-comment-alt">
              💡 Try <strong>{comment.bestAlternative}</strong> instead
            </p>
          )}
          {comment.tip && (
            <p className="coach-comment-tip">📌 {comment.tip}</p>
          )}
        </div>
      )}
    </div>
  );
}

function MoveList({ history, isThinking, activeHalfMove, onJumpTo }: {
  history: CoachMoveEntry[];
  isThinking: boolean;
  activeHalfMove: number | null;
  onJumpTo: (halfMoveIndex: number) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeHalfMove === null) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeHalfMove, history.length, isThinking]);

  if (history.length === 0 && !isThinking) {
    return (
      <div className="coach-movelist-empty">
        <span>Make your first move to begin…</span>
      </div>
    );
  }

  return (
    <div className="coach-movelist">
      {history.map((entry) => (
        <MoveRow
          key={entry.halfMoveIndex}
          entry={entry}
          isActive={activeHalfMove === entry.halfMoveIndex}
          onClick={() => onJumpTo(entry.halfMoveIndex)}
        />
      ))}
      {isThinking && (
        <div className="coach-thinking-indicator">
          <span className="coach-thinking-dots" />
          <span>Coach is thinking…</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface CoachGameProps {
  level: CoachLevel;
  playerColor: 'white' | 'black';
  theme: ThemeConfig;
  onNewGame: () => void;
}

export default function CoachGame({ level, playerColor, theme, onNewGame }: CoachGameProps) {
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const cfg = COACH_LEVELS[level];
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  // ── Dynamic board size ───────────────────────────────────────────────────
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(560);

  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) return;
    const compute = () => {
      const { width, height } = el.getBoundingClientRect();
      const pad = 48;       // 24 px padding on each side
      const navBar = 56;    // nav controls bar height + gap
      setBoardSize(prev => {
        const next = Math.max(320, Math.floor(Math.min(width - pad, height - pad - navBar)));
        return next !== prev ? next : prev;
      });
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    compute();
    return () => ro.disconnect();
  }, []);

  const {
    fen, fenHistory, turn, moveHistory, gameStatus, winner,
    isCoachThinking, engineReady, makePlayerMove, resign, reset,
  } = useCoachGame({ level, playerColor });

  // ── Navigation / review ────────────────────────────────────────────────
  const isReviewing = viewIndex !== null;
  // Keep a ref so navigation callbacks don’t capture a stale length
  const fenHistoryRef = useRef(fenHistory);
  useEffect(() => { fenHistoryRef.current = fenHistory; });
  const effectiveIndex = viewIndex ?? (fenHistory.length - 1);
  const displayFen    = fenHistory[effectiveIndex] ?? fen;
  // halfMoveIndex of the move that produced the currently viewed position
  const activeHalfMove: number | null = (viewIndex !== null && viewIndex > 0) ? viewIndex - 1 : null;
  const canGoPrev = effectiveIndex > 0;
  const canGoNext = isReviewing;

  const goFirst = useCallback(() => setViewIndex(0), []);
  const goPrev  = useCallback(() => {
    setViewIndex(prev => {
      const cur = prev ?? (fenHistoryRef.current.length - 1);
      return cur > 0 ? cur - 1 : prev; // no-op at start
    });
  }, []);
  const goNext  = useCallback(() => {
    setViewIndex(prev => {
      if (prev === null) return null;
      const next = prev + 1;
      // reaching the latest position = return to live mode
      return next >= fenHistoryRef.current.length - 1 ? null : next;
    });
  }, []);
  const goLast  = useCallback(() => setViewIndex(null), []);
  const jumpTo  = useCallback((halfMoveIndex: number) => setViewIndex(halfMoveIndex + 1), []);

  // Keyboard: ← → Home End
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'Home')       { e.preventDefault(); goFirst(); }
      if (e.key === 'End')        { e.preventDefault(); goLast(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goPrev, goNext, goFirst, goLast]);

  const coachColor: 'w' | 'b' = playerColor === 'white' ? 'b' : 'w';
  const isPlayerTurn = !isReviewing && engineReady && turn !== coachColor && gameStatus === 'playing';

  const handleMove = (from: string, to: string, promotion?: string): boolean => {
    if (!isPlayerTurn) return false;
    return makePlayerMove(from, to, promotion);
  };

  const handleResign = () => {
    if (showResignConfirm) {
      resign();
      setShowResignConfirm(false);
    } else {
      setShowResignConfirm(true);
    }
  };

  const handleNewGame = () => {
    reset();
    setViewIndex(null);
    onNewGame();
  };

  // ── Status label ──────────────────────────────────────────────────────────

  let statusLabel = '';
  let statusClass = '';

  if (!engineReady) {
    statusLabel = '⚙️ Engine loading…';
    statusClass = 'thinking';
  } else if (gameStatus === 'playing') {
    if (isCoachThinking) {
      statusLabel = `${cfg.emoji} Coach is thinking…`;
      statusClass = 'thinking';
    } else if (isPlayerTurn) {
      statusLabel = `Your turn (${playerColor === 'white' ? '⬜ White' : '⬛ Black'})`;
      statusClass = 'your-turn';
    } else {
      statusLabel = `${cfg.emoji} Coach is moving…`;
      statusClass = 'thinking';
    }
  } else if (gameStatus === 'checkmate') {
    statusLabel = winner === playerColor ? '🎉 You won by checkmate!' : `${cfg.emoji} Checkmate — Coach wins.`;
    statusClass = winner === playerColor ? 'win' : 'loss';
  } else if (gameStatus === 'draw') {
    statusLabel = '🤝 Draw';
    statusClass = 'draw';
  } else if (gameStatus === 'resigned') {
    statusLabel = `🏳️ You resigned. ${cfg.emoji} Coach wins.`;
    statusClass = 'loss';
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="coach-game">
      {/* Status bar */}
      <div className="coach-status-bar">
        <div className={`coach-status-dot ${statusClass}`} />
        <span className="coach-status-text">{statusLabel}</span>
        <div className="coach-status-spacer" />
        {isReviewing && <span className="coach-review-badge">📽 Reviewing</span>}
        <span className="coach-status-badge">
          {isReviewing
            ? `${effectiveIndex} / ${fenHistory.length - 1}`
            : `Move ${Math.floor(moveHistory.length / 2) + (moveHistory.length % 2 !== 0 ? 1 : 0)}`}
        </span>
      </div>

      <div className="coach-game-body">
        {/* Board */}
        <div className="coach-board-area" ref={boardAreaRef}>
          <div className="coach-board-wrap">
            <ChessBoard
              fen={displayFen}
              theme={theme}
              interactive={isPlayerTurn}
              playerColor={playerColor}
              onMove={handleMove}
              boardWidth={boardSize}
            />
            {!isReviewing && gameStatus !== 'playing' && (
              <div className="coach-game-over-overlay">
                <div className="coach-game-over-card">
                  <div className="coach-game-over-icon">
                    {gameStatus === 'checkmate' && winner === playerColor ? '🎉' : ''}
                    {gameStatus === 'checkmate' && winner !== playerColor ? '♟' : ''}
                    {gameStatus === 'draw' ? '🤝' : ''}
                    {gameStatus === 'resigned' ? '🏳️' : ''}
                  </div>
                  <div className="coach-game-over-title">{statusLabel}</div>
                  <div className="coach-game-over-actions">
                    <button className="btn btn-primary" onClick={handleNewGame}>
                      🔄 New Game
                    </button>
                    <button className="btn btn-ghost" onClick={onNewGame}>
                      ← Change Settings
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Navigation controls */}
          <div className="coach-nav-controls">
            <button className="coach-nav-btn" onClick={goFirst} disabled={!canGoPrev} title="First move (Home)">⏮</button>
            <button className="coach-nav-btn" onClick={goPrev}  disabled={!canGoPrev} title="Previous (←)">◀</button>
            <button className="coach-nav-btn" onClick={goNext}  disabled={!canGoNext} title="Next (→)">▶</button>
            <button className="coach-nav-btn" onClick={goLast}  disabled={!canGoNext} title="Latest position (End)">⏭</button>
          </div>
        </div>

        {/* Side panel */}
        <div className="coach-side-panel">
          {/* Coach info */}
          <div className="coach-info-card">
            <div className="coach-info-avatar">{cfg.emoji}</div>
            <div className="coach-info-details">
              <div className="coach-info-name">{cfg.label} Coach</div>
              <div className="coach-info-rating">{cfg.rating}</div>
            </div>
            <div className={`coach-turn-indicator ${isCoachThinking ? 'thinking' : turn === coachColor && gameStatus === 'playing' ? 'active' : ''}`} />
          </div>

          {/* Move history + comments */}
          <MoveList history={moveHistory} isThinking={isCoachThinking} activeHalfMove={activeHalfMove} onJumpTo={jumpTo} />

          {/* Actions */}
          <div className="coach-actions">
            {gameStatus === 'playing' && (
              <>
                {showResignConfirm ? (
                  <div className="coach-resign-confirm">
                    <span>Are you sure?</span>
                    <button className="btn btn-danger btn-sm" onClick={handleResign}>
                      Yes, Resign
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowResignConfirm(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm coach-resign-btn" onClick={handleResign}>
                    🏳️ Resign
                  </button>
                )}
              </>
            )}
            {gameStatus !== 'playing' && (
              <button className="btn btn-primary" onClick={handleNewGame}>
                🔄 New Game
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onNewGame}>
              ← Change Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
