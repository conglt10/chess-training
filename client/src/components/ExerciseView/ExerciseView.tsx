import { useState, useEffect, useCallback } from 'react';
import './ExerciseView.css';
import { Opening, ThemeConfig } from '../../types';
import { useChessGame } from '../../hooks/useChessGame';
import ChessBoard from '../Board/ChessBoard';
import MoveTable from '../MoveTable/MoveTable';

interface Toast {
  id: number;
  type: 'error' | 'success';
  message: string;
}

interface ExerciseViewProps {
  opening: Opening;
  theme: ThemeConfig;
  onBackToTheory: () => void;
}

export default function ExerciseView({ opening, theme, onBackToTheory }: ExerciseViewProps) {
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastId, setToastId] = useState(0);
  const [showHint, setShowHint] = useState(false);

  const { fen, currentMoveIndex, isComplete, isPlayerTurn, tryUserMove, applySequenceMove, reset } =
    useChessGame({ moves: opening.moves, playerColor });

  const addToast = useCallback((type: 'error' | 'success', message: string) => {
    const id = toastId + 1;
    setToastId(id);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
  }, [toastId]);

  // Auto-play opponent moves
  useEffect(() => {
    if (isComplete || isPlayerTurn) return;
    if (currentMoveIndex >= opening.moves.length) return;

    const timer = setTimeout(() => {
      applySequenceMove(currentMoveIndex);
    }, 600);
    return () => clearTimeout(timer);
  }, [isPlayerTurn, currentMoveIndex, isComplete, applySequenceMove, opening.moves.length]);

  const handleMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    if (!isPlayerTurn || isComplete) return false;
    const result = tryUserMove(from, to, promotion);

    if (result === 'correct') {
      setShowHint(false);
      if (currentMoveIndex + 1 >= opening.moves.length) {
        // completion handled by isComplete
      }
      return true;
    } else {
      addToast('error', '❌ Wrong move! Try again.');
      setShowHint(true);
      setTimeout(() => setShowHint(false), 3000);
      return false;
    }
  }, [isPlayerTurn, isComplete, tryUserMove, currentMoveIndex, opening.moves.length, addToast]);

  const handleReset = () => {
    reset();
    setShowHint(false);
    setToasts([]);
  };

  const handleColorChange = (c: 'white' | 'black') => {
    setPlayerColor(c);
    handleReset();
  };

  const expectedMove = opening.moves[currentMoveIndex];

  return (
    <div className="exercise-view">
      {/* Toasts */}
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}

      {/* Status bar */}
      <div className="exercise-top">
        <div className="exercise-status">
          <div className={`exercise-status-dot ${isComplete ? 'complete' : isPlayerTurn ? 'your-turn' : 'opponent-turn'}`} />
          <span className="exercise-status-text">
            {isComplete
              ? '🎉 Opening Complete!'
              : isPlayerTurn
              ? `Your turn (${playerColor === 'white' ? '⬜ White' : '⬛ Black'})`
              : '⏳ Opponent is moving…'}
          </span>
          {!isComplete && !isPlayerTurn && (
            <span className="exercise-status-sub">Wait for opponent</span>
          )}
        </div>
        <div className="exercise-status" style={{ justifyContent: 'flex-end' }}>
          <span className="badge badge-accent">Move {currentMoveIndex} / {opening.moves.length}</span>
        </div>
      </div>

      <div className="exercise-body">
        {/* Board area */}
        <div className="exercise-board-area">
          <div className="exercise-board-wrap">
            <ChessBoard
              fen={fen}
              theme={theme}
              interactive={isPlayerTurn && !isComplete}
              playerColor={playerColor}
              onMove={handleMove}
              boardWidth={640}
            />
            {isComplete && (
              <div className="completion-overlay">
                <div className="completion-icon">🏆</div>
                <div className="completion-title">Opening Mastered!</div>
                <div className="completion-sub">
                  You played all {opening.moves.length} moves of the <strong>{opening.name}</strong> correctly!
                </div>
                <div className="completion-btns">
                  <button className="btn btn-primary" id="exercise-retry-btn" onClick={handleReset}>
                    🔄 Try Again
                  </button>
                  <button className="btn btn-ghost" id="exercise-back-theory-btn" onClick={onBackToTheory}>
                    📖 Back to Theory
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="exercise-sidebar">
          {showHint && isPlayerTurn && !isComplete && (
            <div className="exercise-hint-box">
              <span>💡</span>
              <span>Hint: The correct move is <strong style={{ fontFamily: 'var(--font-mono)' }}>{expectedMove}</strong></span>
            </div>
          )}

          {/* Color picker */}
          <div className="exercise-color-picker">
            <div className="color-picker-label">Play as</div>
            <div className="color-picker-btns">
              <button
                id="play-as-white"
                className={`color-btn ${playerColor === 'white' ? 'active' : ''}`}
                onClick={() => handleColorChange('white')}
              >
                ⬜ White
              </button>
              <button
                id="play-as-black"
                className={`color-btn ${playerColor === 'black' ? 'active' : ''}`}
                onClick={() => handleColorChange('black')}
              >
                ⬛ Black
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="exercise-actions">
            <button className="btn btn-ghost btn-sm" id="exercise-reset-btn" onClick={handleReset}>
              ↺ Restart
            </button>
            <button className="btn btn-ghost btn-sm" id="exercise-theory-btn" onClick={onBackToTheory}>
              📖 Theory
            </button>
          </div>

          {/* Move table */}
          <div className="exercise-move-table">
            <MoveTable moves={opening.moves} currentMoveIndex={currentMoveIndex} />
          </div>
        </div>
      </div>
    </div>
  );
}
