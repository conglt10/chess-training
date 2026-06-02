import { useState } from 'react';
import './CoachSetup.css';
import type { CoachLevel } from '../../utils/chessAI';
import { COACH_LEVELS } from '../../utils/chessAI';

const LEVEL_ORDER: CoachLevel[] = [
  'beginner', 'intermediate', 'intermediate2',
  'advanced', 'expert', 'master', 'grandmaster',
];

interface CoachSetupProps {
  onStart: (level: CoachLevel, color: 'white' | 'black', strictMode: boolean) => void;
}

export default function CoachSetup({ onStart }: CoachSetupProps) {
  const [selectedLevel, setSelectedLevel] = useState<CoachLevel>('intermediate');
  const [selectedColor, setSelectedColor] = useState<'white' | 'black' | 'random'>('white');
  const [strictMode, setStrictMode] = useState(false);

  const handleStart = () => {
    const color =
      selectedColor === 'random'
        ? Math.random() < 0.5
          ? 'white'
          : 'black'
        : selectedColor;
    onStart(selectedLevel, color, strictMode);
  };

  return (
    <div className="coach-setup">
      <div className="coach-setup-card">
        {/* Header */}
        <div className="coach-setup-header">
          <div className="coach-setup-icon">🤖</div>
          <h1 className="coach-setup-title">Play with Coach</h1>
          <p className="coach-setup-subtitle">
            Test your skills against an AI opponent that teaches as you play.
          </p>
        </div>

        {/* Level picker */}
        <section className="coach-setup-section">
          <h2 className="coach-setup-section-title">Choose Difficulty</h2>
          <div className="coach-level-grid">
            {LEVEL_ORDER.map((lvl) => {
              const cfg = COACH_LEVELS[lvl];
              const active = lvl === selectedLevel;
              return (
                <button
                  key={lvl}
                  className={`coach-level-card ${active ? 'active' : ''}`}
                  onClick={() => setSelectedLevel(lvl)}
                >
                  <span className="coach-level-emoji">{cfg.emoji}</span>
                  <span className="coach-level-name">{cfg.label}</span>
                  <span className="coach-level-rating">{cfg.rating}</span>
                  <span className="coach-level-desc">{cfg.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Color picker */}
        <section className="coach-setup-section">
          <h2 className="coach-setup-section-title">Choose Your Color</h2>
          <div className="coach-color-row">
            {(['white', 'random', 'black'] as const).map((c) => (
              <button
                key={c}
                className={`coach-color-btn ${selectedColor === c ? 'active' : ''}`}
                onClick={() => setSelectedColor(c)}
              >
                <span className="coach-color-icon">
                  {c === 'white' ? '⬜' : c === 'black' ? '⬛' : '🎲'}
                </span>
                <span className="coach-color-label">
                  {c === 'white' ? 'White' : c === 'black' ? 'Black' : 'Random'}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Strict mode (CCA) */}
        <section className="coach-setup-section">
          <h2 className="coach-setup-section-title">Strict Mode (CCA)</h2>
          <p className="coach-setup-section-hint">
            Complete the Checks, Captures, and Attacks checklist before each of your moves.
          </p>
          <div className="coach-strict-row">
            <button
              type="button"
              className={`coach-strict-btn ${!strictMode ? 'active' : ''}`}
              onClick={() => setStrictMode(false)}
            >
              <span className="coach-strict-icon">♟</span>
              <span className="coach-strict-label">Off</span>
              <span className="coach-strict-desc">Move freely</span>
            </button>
            <button
              type="button"
              className={`coach-strict-btn ${strictMode ? 'active' : ''}`}
              onClick={() => setStrictMode(true)}
            >
              <span className="coach-strict-icon">✓</span>
              <span className="coach-strict-label">Strict</span>
              <span className="coach-strict-desc">CCA required</span>
            </button>
          </div>
        </section>

        {/* Summary + start */}
        <div className="coach-setup-summary">
          <span className="coach-setup-summary-text">
            Playing as&nbsp;
            <strong>
              {selectedColor === 'random' ? 'Random color' : selectedColor === 'white' ? '⬜ White' : '⬛ Black'}
            </strong>
            &nbsp;vs&nbsp;
            <strong>
              {COACH_LEVELS[selectedLevel].emoji} {COACH_LEVELS[selectedLevel].label}
            </strong>
            {strictMode && (
              <>
                &nbsp;·&nbsp;
                <strong>Strict (CCA)</strong>
              </>
            )}
          </span>
          <button className="btn btn-primary btn-lg coach-start-btn" onClick={handleStart}>
            Start Game →
          </button>
        </div>
      </div>
    </div>
  );
}
