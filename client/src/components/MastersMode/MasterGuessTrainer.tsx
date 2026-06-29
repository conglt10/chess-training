import { useCallback, useEffect, useRef, useState } from 'react';
import type { Square } from 'react-chessboard/dist/chessboard/types';
import { MasterGame, ThemeConfig } from '../../types';
import { fetchMasterGame } from '../../api/masterGames';
import { useMasterDrill } from '../../hooks/useMasterDrill';
import { useBoardSize } from '../../hooks/useBoardSize';
import { downloadGamePgn } from '../../utils/pgnExport';
import ChessBoard from '../Board/ChessBoard';
import MoveTable from '../MoveTable/MoveTable';
import ClassificationIcon from '../GameReview/ClassificationIcon';
import { CLASSIFICATION_META } from '../../utils/moveClassifier';
import { reviewSingleMove, type SingleMoveReview } from '../../utils/moveAnalysis';
import './MastersMode.css';

const LAST_MOVE_HIGHLIGHT = 'rgba(246, 192, 0, 0.45)';
const BEST_MOVE_ARROW = 'rgba(38, 194, 163, 0.9)';
const SUBOPTIMAL = new Set(['good', 'inaccuracy', 'mistake', 'miss', 'blunder']);

// A player name prefixed with its piece-colour chip.
function Side({ name, elo, color }: { name: string; elo: number | null; color: 'w' | 'b' }) {
  return (
    <span className="masters-side">
      <span className={`pc pc-${color}`} aria-hidden />
      <strong>{name}</strong>{elo ? <span className="masters-elo"> ({elo})</span> : null}
    </span>
  );
}

interface MasterGuessTrainerProps {
  theme: ThemeConfig;
  gameId: string;
  startLine: string[];          // UCI prefix to auto-play before drilling
  heroName?: string;            // when set, default to predicting this player's side
  onBack: () => void;
}

interface Toast { id: number; type: 'error' | 'success'; message: string; }

// Which side did the hero play? Match the hero's last-name token against names.
function heroColor(game: MasterGame, heroName?: string): 'white' | 'black' {
  if (!heroName) return 'white';
  const token = heroName.toLowerCase().split(/\s+/).filter(Boolean).pop() ?? '';
  if (token && game.black.toLowerCase().includes(token) && !game.white.toLowerCase().includes(token)) return 'black';
  return 'white';
}

export default function MasterGuessTrainer({ theme, gameId, startLine, heroName, onBack }: MasterGuessTrainerProps) {
  const [game, setGame] = useState<MasterGame | null>(null);
  const [error, setError] = useState(false);
  const [trainColor, setTrainColor] = useState<'white' | 'black'>('white');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastSeq, setToastSeq] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setGame(null); setError(false);
    fetchMasterGame(gameId)
      .then(g => { if (!cancelled) { setGame(g); setTrainColor(heroColor(g, heroName)); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [gameId, heroName]);

  if (error) {
    return (
      <div className="masters-loading">
        <p>Could not load this game.</p>
        <button className="btn btn-ghost" onClick={onBack}>← Back to explorer</button>
      </div>
    );
  }
  if (!game) return <div className="masters-loading">Loading game…</div>;

  return (
    <Drill
      key={game.id + trainColor}
      theme={theme}
      game={game}
      trainColor={trainColor}
      startPly={Math.min(startLine.length, game.moves.length)}
      onChangeColor={setTrainColor}
      onBack={onBack}
      toasts={toasts}
      addToast={(type, message) => {
        const id = toastSeq + 1;
        setToastSeq(id);
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
      }}
    />
  );
}

interface DrillProps {
  theme: ThemeConfig;
  game: MasterGame;
  trainColor: 'white' | 'black';
  startPly: number;
  onChangeColor: (c: 'white' | 'black') => void;
  onBack: () => void;
  toasts: Toast[];
  addToast: (type: 'error' | 'success', message: string) => void;
}

function Drill({ theme, game, trainColor, startPly, onChangeColor, onBack, toasts, addToast }: DrillProps) {
  const drill = useMasterDrill({ game, trainColor, startPly });
  const { ref: boardAreaRef, size: boardSize } = useBoardSize(0, 360, 760);

  const [reviewMode, setReviewMode] = useState(false);
  const [review, setReview] = useState<SingleMoveReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const reviewReqRef = useRef(0);

  const lastMove = drill.lastMove;

  // Auto-play the prefix + the opponent's real moves.
  useEffect(() => {
    if (!drill.isAutoTurn) return;
    const timer = setTimeout(() => drill.applyMasterMove(drill.currentPly), 550);
    return () => clearTimeout(timer);
  }, [drill.isAutoTurn, drill.currentPly, drill.applyMasterMove]);

  // Review mode: analyze each played move (coach comment + best move).
  useEffect(() => {
    if (!reviewMode || !lastMove || drill.inPrefix) {
      setReview(null);
      setReviewLoading(false);
      return;
    }
    const reqId = ++reviewReqRef.current;
    setReview(null);
    setReviewLoading(true);
    reviewSingleMove(lastMove.fenBefore, lastMove.uci)
      .then(r => { if (reviewReqRef.current === reqId) { setReview(r); setReviewLoading(false); } })
      .catch(() => { if (reviewReqRef.current === reqId) setReviewLoading(false); });
  }, [reviewMode, lastMove, drill.inPrefix]);

  // Highlight the latest move; in review mode also arrow the engine's best move.
  const moveHighlights = lastMove
    ? [{ from: lastMove.from, to: lastMove.to, color: LAST_MOVE_HIGHLIGHT }]
    : [];
  const arrows: [Square, Square, string][] =
    reviewMode && review?.bestUci && lastMove &&
    SUBOPTIMAL.has(review.classification) &&
    review.bestUci.toLowerCase() !== lastMove.uci.toLowerCase()
      ? [[review.bestUci.slice(0, 2) as Square, review.bestUci.slice(2, 4) as Square, BEST_MOVE_ARROW]]
      : [];

  const handleMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    if (!drill.isUserTurn) return false;
    const result = drill.guess(from, to, promotion);
    if (result === 'correct') {
      return true;
    }
    if (result === 'wrong') {
      addToast('error', '❌ Not the master\'s move — try again.');
      drill.setRevealHint(true);
    }
    return false;
  }, [drill, addToast]);

  const moveNumber = Math.floor(drill.currentPly / 2) + 1;
  const accuracy = drill.attempts > 0 ? Math.round((drill.correctCount / drill.attempts) * 100) : 100;
  const resultText = game.result === '1-0' ? 'White won' : game.result === '0-1' ? 'Black won' : game.result === '1/2-1/2' ? 'Draw' : '';

  return (
    <div className="masters-trainer">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}

      <div className="masters-trainer-top glass">
        <div className="masters-game-header">
          <span className="masters-game-sides">
            <Side name={game.white} elo={game.whiteElo} color="w" />
            <span className="masters-vs">vs</span>
            <Side name={game.black} elo={game.blackElo} color="b" />
          </span>
          <span className="masters-game-meta">
            {game.event ? <span className="masters-game-event">{game.event}</span> : null}
            {game.year ? <span className="masters-game-year">{game.year}</span> : null}
            <span className={`masters-result result-${game.result === '1-0' ? 'w' : game.result === '0-1' ? 'b' : 'd'}`}>{game.result}</span>
          </span>
        </div>
      </div>

      <div className="masters-trainer-body">
        <div className="masters-board-area" ref={boardAreaRef}>
          <div className="masters-board-wrap">
            <ChessBoard
              fen={drill.fen}
              theme={theme}
              interactive={drill.isUserTurn}
              playerColor={trainColor}
              onMove={handleMove}
              boardWidth={boardSize}
              moveHighlights={moveHighlights}
              arrows={arrows}
            />
            {drill.isComplete && (
              <div className="completion-overlay">
                <div className="completion-icon">🏆</div>
                <div className="completion-title">Game Complete!</div>
                <div className="completion-sub">
                  You matched <strong>{drill.correctCount}</strong> of {drill.attempts} guesses ({accuracy}% accuracy). {resultText}.
                </div>
                <div className="completion-btns">
                  <button className="btn btn-primary" onClick={drill.reset}>🔄 Replay</button>
                  <button className="btn btn-ghost" onClick={() => downloadGamePgn(game)}>⬇ Download PGN</button>
                  <button className="btn btn-ghost" onClick={onBack}>📜 Back to explorer</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="masters-sidebar">
          <div className="masters-panel glass">
            <div className="masters-status">
              <div className={`masters-status-dot ${drill.isComplete ? 'complete' : drill.isUserTurn ? 'your-turn' : 'auto-turn'}`} />
              <span>
                {drill.isComplete
                  ? '🎉 Done!'
                  : drill.inPrefix
                  ? '⏳ Playing the opening…'
                  : drill.isUserTurn
                  ? `Your move — guess what ${trainColor === 'white' ? 'White' : 'Black'} played`
                  : '⏳ Opponent is replying…'}
              </span>
            </div>
            <div className="masters-stats-row">
              <span className="badge badge-accent">Move {moveNumber}</span>
              <span className="badge">✓ {drill.correctCount}</span>
              <span className="badge">{accuracy}% acc</span>
            </div>
            {drill.revealHint && drill.isUserTurn && (
              <div className="masters-hint">💡 Master played <strong>{drill.expectedSan}</strong></div>
            )}
          </div>

          <div className="masters-panel glass">
            <label className="masters-review-toggle">
              <input type="checkbox" checked={reviewMode} onChange={e => setReviewMode(e.target.checked)} />
              <span className="masters-review-toggle-text">🔍 Review mode</span>
            </label>
            <p className="masters-review-sub">Show the coach's comment, explanation & best move after each move.</p>
            {reviewMode && (
              reviewLoading ? (
                <div className="masters-review-loading"><span className="masters-review-spinner" /> Analyzing move…</div>
              ) : review && lastMove ? (
                <div className="masters-review-card" style={{ borderColor: CLASSIFICATION_META[review.classification].color }}>
                  <div className="masters-review-head">
                    <ClassificationIcon classification={review.classification} size={22} title={false} />
                    <span className="masters-review-move">{lastMove.san}</span>
                    <span className="masters-review-headline" style={{ color: CLASSIFICATION_META[review.classification].color }}>
                      {review.comment.headline}
                    </span>
                  </div>
                  <p className="masters-review-detail">{review.comment.detail}</p>
                  {review.comment.suggestion && (
                    <p className="masters-review-best">💡 Best was <strong>{review.comment.suggestion}</strong></p>
                  )}
                  {review.tip && <p className="masters-review-tip">📌 {review.tip}</p>}
                </div>
              ) : (
                <div className="masters-review-empty">Make a move to see the coach's review.</div>
              )
            )}
          </div>

          <div className="masters-panel glass">
            <div className="masters-panel-title">Predict moves for</div>
            <div className="color-picker-btns">
              <button className={`color-btn ${trainColor === 'white' ? 'active' : ''}`} onClick={() => onChangeColor('white')}>⬜ White</button>
              <button className={`color-btn ${trainColor === 'black' ? 'active' : ''}`} onClick={() => onChangeColor('black')}>⬛ Black</button>
            </div>
            <div className="masters-actions">
              {drill.isUserTurn && (
                <button className="btn btn-ghost btn-sm" onClick={drill.revealAndAdvance}>👁 Reveal & skip</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={drill.reset}>↺ Restart</button>
              <button className="btn btn-ghost btn-sm" onClick={() => downloadGamePgn(game)}>⬇ Download PGN</button>
              <button className="btn btn-ghost btn-sm" onClick={onBack}>📜 Explorer</button>
            </div>
          </div>

          <div className="masters-move-table">
            {/* Only reveal moves played so far while drilling — showing the full
                game would spoil the answer. Reveal everything once complete. */}
            <MoveTable
              moves={drill.isComplete ? game.moves : game.moves.slice(0, drill.currentPly)}
              currentMoveIndex={drill.currentPly}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
