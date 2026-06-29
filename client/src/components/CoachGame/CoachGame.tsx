import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import './CoachGame.css';
import ChessBoard, {
  COACH_LAST_MOVE_COLOR,
  PLAYER_LAST_MOVE_COLOR,
  type MoveSquareHighlight,
} from '../Board/ChessBoard';
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

// ── CCA checklist (strict mode) ────────────────────────────────────────────────

type CcaKey = 'checks' | 'captures' | 'attacks';

const CCA_ITEMS: { key: CcaKey; label: string }[] = [
  { key: 'checks', label: 'Checks' },
  { key: 'captures', label: 'Captures' },
  { key: 'attacks', label: 'Attacks' },
];

type CcaState = Record<CcaKey, boolean>;

const EMPTY_CCA: CcaState = { checks: false, captures: false, attacks: false };

function isCcaComplete(cca: CcaState): boolean {
  return cca.checks && cca.captures && cca.attacks;
}

function CcaChecklist({
  cca,
  onToggle,
  disabled,
}: {
  cca: CcaState;
  onToggle: (key: CcaKey) => void;
  disabled: boolean;
}) {
  const complete = isCcaComplete(cca);

  return (
    <div className={`coach-cca-card${complete ? ' complete' : ''}`}>
      <div className="coach-cca-header">
        <span className="coach-cca-title">CCA checklist</span>
        <span className="coach-cca-badge">Strict</span>
      </div>
      <p className="coach-cca-hint">
        Tick each item before moving. Look for checks, captures, and attacks against you.
      </p>
      <ul className="coach-cca-list">
        {CCA_ITEMS.map(({ key, label }) => (
          <li key={key}>
            <label className={`coach-cca-item${cca[key] ? ' checked' : ''}`}>
              <input
                type="checkbox"
                checked={cca[key]}
                disabled={disabled}
                onChange={() => onToggle(key)}
              />
              <span className="coach-cca-check" aria-hidden />
              <span className="coach-cca-label">{label}</span>
            </label>
          </li>
        ))}
      </ul>
      {!complete && !disabled && (
        <p className="coach-cca-warning">Complete all items to unlock the board.</p>
      )}
    </div>
  );
}

// ── PGN builder (for handing the finished game to Game Review) ──────────────────

function buildCoachPgn(
  moveHistory: CoachMoveEntry[],
  playerColor: 'white' | 'black',
  levelLabel: string,
  winner: 'white' | 'black' | 'draw' | null,
): string {
  const chess = new Chess();
  for (const entry of moveHistory) {
    try { chess.move(entry.san); } catch { break; }
  }
  const you = 'You';
  const coach = `Coach (${levelLabel})`;
  const result = winner === 'white' ? '1-0' : winner === 'black' ? '0-1' : winner === 'draw' ? '1/2-1/2' : '*';
  chess.header(
    'Event', 'Play with Coach',
    'White', playerColor === 'white' ? you : coach,
    'Black', playerColor === 'white' ? coach : you,
    'Result', result,
  );
  return chess.pgn();
}

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
  strictMode: boolean;
  theme: ThemeConfig;
  onNewGame: () => void;
  /** Hand the finished game (as PGN) to the Game Review screen. */
  onReview?: (pgn: string) => void;
}

export default function CoachGame({ level, playerColor, strictMode, theme, onNewGame, onReview }: CoachGameProps) {
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [cca, setCca] = useState<CcaState>(EMPTY_CCA);
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
  const playerColorChar: 'w' | 'b' = playerColor === 'white' ? 'w' : 'b';

  const moveHighlights = useMemo((): MoveSquareHighlight[] => {
    const findLast = (color: 'w' | 'b'): MoveSquareHighlight | null => {
      for (let i = moveHistory.length - 1; i >= 0; i--) {
        const entry = moveHistory[i];
        if (entry.halfMoveIndex >= effectiveIndex) continue;
        if (entry.color !== color) continue;
        return { from: entry.from, to: entry.to };
      }
      return null;
    };

    const highlights: MoveSquareHighlight[] = [];
    const coach = findLast(coachColor);
    const player = findLast(playerColorChar);
    if (coach) highlights.push({ ...coach, color: COACH_LAST_MOVE_COLOR });
    if (player) highlights.push({ ...player, color: PLAYER_LAST_MOVE_COLOR });
    return highlights;
  }, [moveHistory, effectiveIndex, coachColor, playerColorChar]);

  const isPlayerTurn = !isReviewing && engineReady && turn !== coachColor && gameStatus === 'playing';
  const ccaComplete = isCcaComplete(cca);
  const canMovePieces = isPlayerTurn && (!strictMode || ccaComplete);
  const showCcaChecklist = strictMode && gameStatus === 'playing' && !isReviewing;

  const resetCca = useCallback(() => setCca(EMPTY_CCA), []);

  useEffect(() => {
    if (!isPlayerTurn) resetCca();
  }, [isPlayerTurn, resetCca]);

  const toggleCca = useCallback((key: CcaKey) => {
    setCca((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleMove = (from: string, to: string, promotion?: string): boolean => {
    if (!canMovePieces) return false;
    const ok = makePlayerMove(from, to, promotion);
    if (ok) resetCca();
    return ok;
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
    resetCca();
    setViewIndex(null);
    onNewGame();
  };

  const canReview = !!onReview && gameStatus !== 'playing' && moveHistory.length > 0;
  const handleReview = () => {
    if (!canReview) return;
    onReview!(buildCoachPgn(moveHistory, playerColor, cfg.label, winner));
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
      const colorLabel = playerColor === 'white' ? '⬜ White' : '⬛ Black';
      if (strictMode && !ccaComplete) {
        statusLabel = `Complete CCA checklist (${colorLabel})`;
        statusClass = 'thinking';
      } else {
        statusLabel = `Your turn (${colorLabel})`;
        statusClass = 'your-turn';
      }
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
        {strictMode && gameStatus === 'playing' && (
          <span className="coach-strict-mode-badge">CCA Strict</span>
        )}
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
              interactive={canMovePieces}
              playerColor={playerColor}
              onMove={handleMove}
              boardWidth={boardSize}
              moveHighlights={moveHighlights}
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
                    {canReview && (
                      <button className="btn btn-primary" onClick={handleReview}>
                        📊 Review Game
                      </button>
                    )}
                    <button className={`btn ${canReview ? 'btn-ghost' : 'btn-primary'}`} onClick={handleNewGame}>
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

          {showCcaChecklist && (
            <CcaChecklist
              cca={cca}
              onToggle={toggleCca}
              disabled={!isPlayerTurn}
            />
          )}

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
            {canReview && (
              <button className="btn btn-primary btn-sm coach-review-btn" onClick={handleReview}>
                📊 Review Game
              </button>
            )}
            {gameStatus !== 'playing' && (
              <button className={`btn btn-sm ${canReview ? 'btn-ghost' : 'btn-primary'}`} onClick={handleNewGame}>
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
