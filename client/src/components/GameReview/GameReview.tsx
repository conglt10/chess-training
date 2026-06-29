import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './GameReview.css';
import ChessBoard from '../Board/ChessBoard';
import type { Square } from 'react-chessboard/dist/chessboard/types';
import ClassificationIcon from './ClassificationIcon';
import ReviewSummary from './ReviewSummary';
import EvalGraph from './EvalGraph';
import EvalBar from './EvalBar';
import GameImport from './GameImport';
import { useGameReview } from '../../hooks/useGameReview';
import { useBoardSize } from '../../hooks/useBoardSize';
import { parsePgn } from '../../utils/pgnImport';
import { playMoveSound } from '../../utils/sound';
import { CLASSIFICATION_META } from '../../utils/moveClassifier';
import type { ThemeConfig } from '../../types';

const SUBOPTIMAL = new Set(['good', 'inaccuracy', 'mistake', 'miss', 'blunder']);
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface Props {
  theme: ThemeConfig;
  /** When set, auto-start the review on this PGN and skip the import screen. */
  initialPgn?: string;
  /** Board orientation to start with (e.g. the player's side for a coach game). */
  initialOrientation?: 'white' | 'black';
  /** When set, "back"/"new game" buttons call this instead of returning to the import screen. */
  onExit?: () => void;
  /** Label for the exit button (defaults to "← Back"). */
  exitLabel?: string;
}

function formatEval(cp: number, mate: number | null): string {
  if (mate !== null) return `${mate > 0 ? '+' : '-'}M${Math.abs(mate)}`;
  const p = cp / 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}`;
}

export default function GameReview({ theme, initialPgn, initialOrientation = 'white', onExit, exitLabel = '← Back' }: Props) {
  const { state, start, reset, setCurrentPly } = useGameReview();
  const [parseError, setParseError] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'white' | 'black'>(initialOrientation);

  const { ref: boardAreaRef, size: boardSize } = useBoardSize(56, 320, 760, 42);

  const { phase, moves, currentPly, game } = state;
  const embedded = !!initialPgn;
  // Where back/cancel/new-game buttons lead: out (embedded) or import screen (standalone).
  const exit = onExit ?? reset;

  const handleSubmit = useCallback((pgn: string) => {
    setParseError(null);
    try {
      const parsed = parsePgn(pgn);
      start(parsed);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Could not parse PGN.');
    }
  }, [start]);

  // Auto-start review for an embedded (e.g. coach) game. No mount guard: under
  // React StrictMode the mount effect runs twice, and start() must run on the
  // second pass to clear the cancel flag set by the in-between cleanup. start()
  // and handleSubmit are stable, so this only fires on mount / when the PGN changes.
  useEffect(() => {
    if (initialPgn) handleSubmit(initialPgn);
  }, [initialPgn, handleSubmit]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goFirst = useCallback(() => setCurrentPly(-1), [setCurrentPly]);
  const goPrev = useCallback(() => setCurrentPly(Math.max(-1, currentPly - 1)), [currentPly, setCurrentPly]);
  const goNext = useCallback(() => setCurrentPly(Math.min(moves.length - 1, currentPly + 1)), [currentPly, moves.length, setCurrentPly]);
  const goLast = useCallback(() => setCurrentPly(moves.length - 1), [moves.length, setCurrentPly]);

  useEffect(() => {
    if (phase !== 'done') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'Home') { e.preventDefault(); goFirst(); }
      if (e.key === 'End') { e.preventDefault(); goLast(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, goPrev, goNext, goFirst, goLast]);

  // Play a move/capture sound whenever navigation lands on a new position.
  const prevPlyRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== 'done') { prevPlyRef.current = null; return; }
    const prev = prevPlyRef.current;
    prevPlyRef.current = currentPly;
    if (prev === null) return;                 // first frame in review — don't sound the auto-shown move
    if (prev === currentPly || currentPly < 0) return; // unchanged, or back to the start position
    const mv = moves[currentPly];
    if (mv) playMoveSound(mv.isCapture);
  }, [currentPly, phase, moves]);

  const activeMove = currentPly >= 0 ? moves[currentPly] : null;
  const displayFen = activeMove ? activeMove.fenAfter : (game?.fens[0] ?? START_FEN);

  const moveHighlights = useMemo(() =>
    activeMove
      ? [{ from: activeMove.from, to: activeMove.to, color: 'rgba(246,192,0,0.45)' }]
      : [],
    [activeMove]);

  const arrows = useMemo((): [Square, Square, string][] => {
    if (!activeMove?.bestUci) return [];
    if (!SUBOPTIMAL.has(activeMove.classification)) return [];
    if (activeMove.bestUci.toLowerCase() === activeMove.uci.toLowerCase()) return [];
    return [[
      activeMove.bestUci.slice(0, 2) as Square,
      activeMove.bestUci.slice(2, 4) as Square,
      'rgba(38,194,163,0.9)',
    ]];
  }, [activeMove]);

  // Classification icon overlaid on the destination square of the active move
  const iconOverlay = useMemo(() => {
    if (!activeMove) return null;
    const sq = boardSize / 8;
    const file = activeMove.to.charCodeAt(0) - 97;
    const rank = parseInt(activeMove.to[1], 10) - 1;
    const col = orientation === 'white' ? file : 7 - file;
    const row = orientation === 'white' ? 7 - rank : rank;
    const iconSize = Math.max(20, sq * 0.46);
    const left = col * sq + sq - iconSize * 0.62;
    const top = row * sq - iconSize * 0.28;
    return (
      <div className="review-board-icon" style={{ left, top }}>
        <ClassificationIcon classification={activeMove.classification} size={iconSize} title={false} />
      </div>
    );
  }, [activeMove, boardSize, orientation]);

  // ── Import / analyzing / error screens ──────────────────────────────────────
  // Standalone mode shows the import UI; embedded (coach) mode never does.
  if (!embedded && (phase === 'idle' || (phase === 'error' && !game) || parseError)) {
    return <GameImport onSubmit={handleSubmit} error={parseError ?? state.error} />;
  }

  if (embedded && parseError) {
    return (
      <div className="review-analyzing">
        <div className="review-analyzing-card glass">
          <h2>⚠ Could not review this game</h2>
          <p>{parseError}</p>
          <button className="btn btn-primary" onClick={exit}>{exitLabel}</button>
        </div>
      </div>
    );
  }

  if (phase === 'analyzing' || (embedded && phase === 'idle')) {
    return (
      <div className="review-analyzing">
        <div className="review-analyzing-card glass">
          <div className="review-analyzing-spinner" />
          <h2>Analyzing game…</h2>
          {game && <p className="review-analyzing-players">{game.white} vs {game.black}</p>}
          <div className="review-progress-track">
            <div className="review-progress-fill" style={{ width: `${Math.round(state.progress * 100)}%` }} />
          </div>
          <p className="review-progress-text">{Math.round(state.progress * 100)}%</p>
          <button className="btn btn-ghost btn-sm" onClick={exit}>{onExit ? exitLabel : 'Cancel'}</button>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="review-analyzing">
        <div className="review-analyzing-card glass">
          <h2>⚠ Analysis failed</h2>
          <p>{state.error}</p>
          <button className="btn btn-primary" onClick={exit}>{onExit ? exitLabel : '← Try another game'}</button>
        </div>
      </div>
    );
  }

  // ── Review screen ───────────────────────────────────────────────────────────
  if (!game) return null;
  const meta = activeMove ? CLASSIFICATION_META[activeMove.classification] : null;

  return (
    <div className="review-screen">
      <div className="review-status-bar">
        <span className="review-status-title">🔍 Game Review</span>
        {state.openingName && <span className="review-status-opening">{state.openingName}</span>}
        <div className="review-status-spacer" />
        <span className="review-status-eval">
          {activeMove ? formatEval(activeMove.evalAfter, activeMove.mateAfter) : '0.0'}
        </span>
        <span className="review-status-badge">{currentPly + 1} / {moves.length}</span>
        <button className="btn btn-ghost btn-sm" onClick={exit}>{onExit ? exitLabel : '← New game'}</button>
      </div>

      <div className="review-body">
        {/* Board */}
        <div className="review-board-area" ref={boardAreaRef}>
          <div className="review-board-row">
            <EvalBar
              cp={activeMove ? activeMove.evalAfter : 0}
              mate={activeMove ? activeMove.mateAfter : null}
              orientation={orientation}
              height={boardSize}
            />
            <div className="review-board-wrap" style={{ width: boardSize, height: boardSize }}>
              <ChessBoard
                fen={displayFen}
                theme={theme}
                interactive={false}
                playerColor={orientation}
                boardWidth={boardSize}
                moveHighlights={moveHighlights}
                arrows={arrows}
              />
              {iconOverlay}
            </div>
          </div>
          <div className="review-nav-controls">
            <button className="coach-nav-btn" onClick={goFirst} disabled={currentPly < 0} title="Start (Home)">⏮</button>
            <button className="coach-nav-btn" onClick={goPrev} disabled={currentPly < 0} title="Previous (←)">◀</button>
            <button className="coach-nav-btn" onClick={goNext} disabled={currentPly >= moves.length - 1} title="Next (→)">▶</button>
            <button className="coach-nav-btn" onClick={goLast} disabled={currentPly >= moves.length - 1} title="End (End)">⏭</button>
            <button className="coach-nav-btn" onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')} title="Flip board">⤢</button>
          </div>
        </div>

        {/* Side panel */}
        <div className="review-panel">
          <ReviewSummary
            game={game}
            accuracy={state.accuracy}
            counts={state.counts}
            openingName={state.openingName}
            openingEco={state.openingEco}
          />

          <EvalGraph evalSeries={state.evalSeries} currentPly={currentPly} onSelectPly={setCurrentPly} />

          {/* Coach comment for the active move */}
          {activeMove && meta ? (
            <div className="review-comment-card" style={{ borderColor: meta.color }}>
              <div className="review-comment-head">
                <ClassificationIcon classification={activeMove.classification} size={24} title={false} />
                <span className="review-comment-move">{activeMove.moveNumber}.{activeMove.color === 'b' ? '..' : ''} {activeMove.san}</span>
                <span className="review-comment-headline" style={{ color: meta.color }}>{activeMove.comment.headline}</span>
              </div>
              <p className="review-comment-detail">{activeMove.comment.detail}</p>
              {activeMove.comment.suggestion && (
                <p className="review-comment-best">💡 Better was <strong>{activeMove.comment.suggestion}</strong></p>
              )}
              {activeMove.tip && <p className="review-comment-tip">📌 {activeMove.tip}</p>}
            </div>
          ) : (
            <div className="review-comment-card">
              <p className="review-comment-detail">Starting position. Use ▶ or the arrow keys to step through the game.</p>
            </div>
          )}

          {/* Move list */}
          <div className="review-movelist">
            {Array.from({ length: Math.ceil(moves.length / 2) }, (_, row) => {
              const w = moves[row * 2];
              const b = moves[row * 2 + 1];
              return (
                <div className="review-move-row" key={row}>
                  <span className="review-move-num">{row + 1}.</span>
                  <MoveCell move={w} isActive={w?.ply === currentPly} onClick={setCurrentPly} />
                  <MoveCell move={b} isActive={b?.ply === currentPly} onClick={setCurrentPly} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MoveCell({ move, isActive, onClick }: {
  move: ReturnType<typeof useGameReview>['state']['moves'][number] | undefined;
  isActive: boolean;
  onClick: (ply: number) => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive]);

  if (!move) return <span className="review-move-cell empty" />;
  const meta = CLASSIFICATION_META[move.classification];
  return (
    <button
      ref={rowRef}
      className={`review-move-cell${isActive ? ' active' : ''}`}
      onClick={() => onClick(move.ply)}
    >
      <ClassificationIcon classification={move.classification} size={15} title={false} />
      <span className="review-move-san" style={{ color: meta.color }}>{move.san}{meta.symbol}</span>
    </button>
  );
}
