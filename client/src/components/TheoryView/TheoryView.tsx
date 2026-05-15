import { useState, useEffect, useCallback, useRef } from 'react';
import './TheoryView.css';
import { Opening, ThemeConfig } from '../../types';
import { useChessGame } from '../../hooks/useChessGame';
import ChessBoard from '../Board/ChessBoard';
import MoveTable from '../MoveTable/MoveTable';

interface TheoryViewProps {
  opening: Opening;
  theme: ThemeConfig;
  onStartExercise: () => void;
}

const SPEEDS = [
  { label: '0.5×', ms: 2000 },
  { label: '1×', ms: 1000 },
  { label: '2×', ms: 500 },
  { label: '3×', ms: 333 },
];

export default function TheoryView({ opening, theme, onStartExercise }: TheoryViewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { fen, currentMoveIndex, isComplete, stepForward, stepBack, reset, fastForwardToEnd } = useChessGame({
    moves: opening.moves,
  });

  const stopPlay = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) clearTimeout(intervalRef.current);
  }, []);

  const scheduleNext = useCallback(() => {
    intervalRef.current = setTimeout(() => {
      if (isComplete) { stopPlay(); return; }
      stepForward();
    }, SPEEDS[speedIdx].ms);
  }, [isComplete, speedIdx, stepForward, stopPlay]);

  useEffect(() => {
    if (isPlaying) {
      scheduleNext();
    }
    return () => { if (intervalRef.current) clearTimeout(intervalRef.current); };
  }, [isPlaying, currentMoveIndex, scheduleNext]);

  useEffect(() => { if (isComplete) stopPlay(); }, [isComplete, stopPlay]);

  useEffect(() => { reset(); setIsPlaying(false); }, [opening, reset]);

  const togglePlay = () => {
    if (isComplete) { reset(); setIsPlaying(true); return; }
    setIsPlaying(p => !p);
  };

  const handleReset = () => { stopPlay(); reset(); };

  return (
    <div className="theory-view">
      <div className="theory-top">
        <div className="theory-breadcrumb">
          <span>ECO {opening.eco}</span>
          <span>›</span>
          <span>{opening.family}</span>
        </div>
        <div className="theory-title-row">
          <div>
            <h2 className="theory-title">{opening.name}</h2>
            <p className="theory-desc">
              Study the move sequence below. Use the controls to step through or auto-play.
              When ready, start the exercise to test yourself!
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div className="theory-badges">
              <span className="badge badge-gold">{opening.eco}</span>
              <span className="badge badge-accent">{opening.moves.length} plies</span>
              <span className="badge badge-accent">{Math.ceil(opening.moves.length / 2)} moves</span>
            </div>
          </div>
        </div>
      </div>

      <div className="theory-body">
        {/* Board area */}
        <div className="theory-board-area">
          <div className="theory-board-wrap">
            <ChessBoard
              fen={fen}
              theme={theme}
              interactive={false}
              boardWidth={640}
            />
          </div>

          {/* Playback controls */}
          <div className="theory-controls">
            <button
              className="ctrl-btn"
              id="theory-to-start"
              title="To start"
              disabled={currentMoveIndex === 0}
              onClick={handleReset}
            >⏮</button>
            <button
              className="ctrl-btn"
              id="theory-step-back"
              title="Step back"
              disabled={currentMoveIndex === 0}
              onClick={() => { stopPlay(); stepBack(); }}
            >◀</button>
            <button
              className="ctrl-btn ctrl-btn-play"
              id="theory-play-pause"
              title={isPlaying ? 'Pause' : 'Play'}
              onClick={togglePlay}
            >{isPlaying ? '⏸' : '▶'}</button>
            <button
              className="ctrl-btn"
              id="theory-step-forward"
              title="Step forward"
              disabled={isComplete}
              onClick={() => { stopPlay(); stepForward(); }}
            >▶</button>
            <button
              className="ctrl-btn"
              id="theory-to-end"
              title="To end"
              disabled={isComplete}
              onClick={() => {
                stopPlay();
                fastForwardToEnd();
              }}
            >⏭</button>
          </div>

          <div className="auto-play-speed">
            <span>Speed:</span>
            <select
              id="theory-speed"
              className="speed-select"
              value={speedIdx}
              onChange={e => setSpeedIdx(Number(e.target.value))}
            >
              {SPEEDS.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* PGN */}
          <div className="theory-pgn-box" style={{ width: 640 }}>
            <div className="theory-pgn-label">PGN</div>
            <div className="theory-pgn-text">{opening.pgn}</div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="theory-sidebar">
          <div className="theory-action-panel">
            <div className="theory-action-title">🎯 Ready to Practice?</div>
            <div className="theory-action-desc">
              Once you've studied the moves, test yourself in Exercise Mode.
              You'll need to play the correct moves — wrong moves will be rejected!
            </div>
            <div className="theory-action-btns">
              <button
                className="btn btn-primary"
                id="start-exercise-btn"
                onClick={onStartExercise}
              >
                🏋 Start Exercise
              </button>
              <button
                className="btn btn-ghost"
                id="theory-reset-btn"
                onClick={handleReset}
              >
                ↺ Reset Board
              </button>
            </div>
          </div>

          <div className="theory-move-table">
            <MoveTable moves={opening.moves} currentMoveIndex={currentMoveIndex} />
          </div>
        </div>
      </div>
    </div>
  );
}
