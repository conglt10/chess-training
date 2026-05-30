import { useState, useEffect, useCallback, useRef } from 'react';
import './VisionTraining.css';
import { ThemeConfig } from '../../types';

// Load standard chess sounds
const correctSound = new Audio('https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3');
const wrongSound = new Audio('https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/GenericError.mp3');

function playCorrect() {
  correctSound.currentTime = 0;
  correctSound.play().catch(() => {});
}

function playWrong() {
  wrongSound.currentTime = 0;
  wrongSound.play().catch(() => {});
}

interface VisionTrainingProps {
  theme: ThemeConfig;
}

type TrainingType = 'color' | 'coordinate';
type SessionType = 'timed' | 'practice';
type Perspective = 'white' | 'black' | 'random';
type GameState = 'lobby' | 'countdown' | 'active' | 'summary';

interface AttemptLog {
  id: number;
  prompt: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

function getRandomCoordinate(exclude?: string): string {
  let file = FILES[Math.floor(Math.random() * 8)];
  let rank = RANKS[Math.floor(Math.random() * 8)];
  let coord = `${file}${rank}`;
  while (exclude && coord === exclude) {
    file = FILES[Math.floor(Math.random() * 8)];
    rank = RANKS[Math.floor(Math.random() * 8)];
    coord = `${file}${rank}`;
  }
  return coord;
}

function isSquareLight(coord: string): boolean {
  const file = coord.charCodeAt(0) - 96; // 'a' = 1, 'b' = 2, ...
  const rank = parseInt(coord[1], 10);   // '1' = 1, '2' = 2, ...
  return (file + rank) % 2 === 1;        // Odd sum is Light/White, Even is Dark/Black
}

export default function VisionTraining({ theme }: VisionTrainingProps) {
  // Game Configuration States
  const [trainingType, setTrainingType] = useState<TrainingType>('color');
  const [sessionType, setSessionType] = useState<SessionType>('timed');
  const [perspective, setPerspective] = useState<Perspective>('white');
  const [showCoordinates, setShowCoordinates] = useState(true);

  // Active Game States
  const [gameState, setGameState] = useState<GameState>('lobby');
  const [timeLeft, setTimeLeft] = useState(30);
  const [currentPrompt, setCurrentPrompt] = useState('');
  
  // Game statistics
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [history, setHistory] = useState<AttemptLog[]>([]);
  const [highScore, setHighScore] = useState(0);

  // Sub-states for Coordinate Board visual feedback
  const [currentPerspective, setCurrentPerspective] = useState<'white' | 'black'>('white');
  const [clickedSquare, setClickedSquare] = useState<string | null>(null);
  const [isCorrectClick, setIsCorrectClick] = useState<boolean | null>(null);
  const [flashCorrectSquare, setFlashCorrectSquare] = useState<string | null>(null);
  const [inputLocked, setInputLocked] = useState(false);

  // Time logging for speed calculation
  const questionStartTime = useRef<number>(0);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0); // in ms

  // Load High Score from localStorage when training configurations change
  useEffect(() => {
    const key = `chess-vision-highscore-${trainingType}-${sessionType}`;
    const stored = localStorage.getItem(key);
    setHighScore(stored ? parseInt(stored, 10) : 0);
  }, [trainingType, sessionType]);

  // Game countdown timer removed — session starts immediately

  // Session Time Left Countdown
  useEffect(() => {
    if (gameState !== 'active' || sessionType !== 'timed') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          endSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, sessionType]);

  const endSession = useCallback(() => {
    setGameState('summary');
    // Save high score if applicable
    const key = `chess-vision-highscore-${trainingType}-${sessionType}`;
    const stored = localStorage.getItem(key);
    const currentHighScore = stored ? parseInt(stored, 10) : 0;
    if (score > currentHighScore) {
      localStorage.setItem(key, score.toString());
      setHighScore(score);
    }
  }, [score, trainingType, sessionType]);

  // Core Handler for answer submissions
  const handleAnswer = useCallback((answer: 'white' | 'black' | string) => {
    if (gameState !== 'active' || inputLocked) return;

    const timeSpentOnQuestion = Date.now() - questionStartTime.current;
    setTotalTimeSpent((prev) => prev + timeSpentOnQuestion);

    let isCorrect = false;
    let correctAnswerStr = '';

    if (trainingType === 'color') {
      const isLight = isSquareLight(currentPrompt);
      const correctColor = isLight ? 'white' : 'black';
      isCorrect = answer === correctColor;
      correctAnswerStr = isLight ? 'White' : 'Black';

      if (isCorrect) {
        playCorrect();
        setScore((s) => s + 1);
        setStreak((str) => {
          const next = str + 1;
          setBestStreak((b) => Math.max(b, next));
          return next;
        });
      } else {
        playWrong();
        setStreak(0);
      }

      // Add to log
      const newLog: AttemptLog = {
        id: Date.now(),
        prompt: currentPrompt,
        userAnswer: answer === 'white' ? 'White' : 'Black',
        correctAnswer: correctAnswerStr,
        isCorrect,
      };
      setHistory((prev) => [newLog, ...prev.slice(0, 4)]);
      setTotalAttempts((t) => t + 1);

      // Generate next question
      const nextPrompt = getRandomCoordinate(currentPrompt);
      setCurrentPrompt(nextPrompt);
      questionStartTime.current = Date.now();

    } else {
      // Coordinate board clicks
      const clickedCoord = answer;
      isCorrect = clickedCoord === currentPrompt;
      correctAnswerStr = currentPrompt;

      setClickedSquare(clickedCoord);
      setIsCorrectClick(isCorrect);
      setInputLocked(true);

      if (isCorrect) {
        playCorrect();
        setScore((s) => s + 1);
        setStreak((str) => {
          const next = str + 1;
          setBestStreak((b) => Math.max(b, next));
          return next;
        });

        // Add to log
        const newLog: AttemptLog = {
          id: Date.now(),
          prompt: currentPrompt,
          userAnswer: clickedCoord,
          correctAnswer: correctAnswerStr,
          isCorrect,
        };
        setHistory((prev) => [newLog, ...prev.slice(0, 4)]);
        setTotalAttempts((t) => t + 1);

        // Immediate transition for correct click on board
        setTimeout(() => {
          setClickedSquare(null);
          setIsCorrectClick(null);
          setInputLocked(false);

          // Change perspective if random
          if (perspective === 'random') {
            setCurrentPerspective(Math.random() < 0.5 ? 'white' : 'black');
          }

          const nextPrompt = getRandomCoordinate(currentPrompt);
          setCurrentPrompt(nextPrompt);
          questionStartTime.current = Date.now();
        }, 300);

      } else {
        playWrong();
        setStreak(0);
        setFlashCorrectSquare(currentPrompt); // show correct square outline in green

        // Add to log
        const newLog: AttemptLog = {
          id: Date.now(),
          prompt: currentPrompt,
          userAnswer: clickedCoord,
          correctAnswer: correctAnswerStr,
          isCorrect,
        };
        setHistory((prev) => [newLog, ...prev.slice(0, 4)]);
        setTotalAttempts((t) => t + 1);

        // Slow transition for wrong click to let them see the correct square
        setTimeout(() => {
          setClickedSquare(null);
          setIsCorrectClick(null);
          setFlashCorrectSquare(null);
          setInputLocked(false);

          // Change perspective if random
          if (perspective === 'random') {
            setCurrentPerspective(Math.random() < 0.5 ? 'white' : 'black');
          }

          const nextPrompt = getRandomCoordinate(currentPrompt);
          setCurrentPrompt(nextPrompt);
          questionStartTime.current = Date.now();
        }, 700);
      }
    }
  }, [gameState, trainingType, currentPrompt, inputLocked, perspective, score]);

  const startSession = () => {
    setScore(0);
    setTotalAttempts(0);
    setStreak(0);
    setBestStreak(0);
    setHistory([]);
    setTimeLeft(30);
    setTotalTimeSpent(0);
    const firstPrompt = getRandomCoordinate();
    setCurrentPrompt(firstPrompt);
    if (perspective === 'random') {
      setCurrentPerspective(Math.random() < 0.5 ? 'white' : 'black');
    } else {
      setCurrentPerspective(perspective);
    }
    questionStartTime.current = Date.now();
    setGameState('active');
  };

  const quitSession = () => {
    setGameState('lobby');
    setClickedSquare(null);
    setFlashCorrectSquare(null);
    setInputLocked(false);
  };

  // Build Chess Board coordinates based on current perspective
  const boardRanks = currentPerspective === 'white'
    ? ['8', '7', '6', '5', '4', '3', '2', '1']
    : ['1', '2', '3', '4', '5', '6', '7', '8'];

  const boardFiles = currentPerspective === 'white'
    ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

  const boardSquares: string[] = [];
  for (const r of boardRanks) {
    for (const f of boardFiles) {
      boardSquares.push(`${f}${r}`);
    }
  }

  // Statistics Computations
  const accuracy = totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 0;
  const avgSpeed = score > 0 ? (totalTimeSpent / score / 1000).toFixed(1) : '0.0';

  // Performance Category evaluation
  let performanceRank = 'Beginner';
  let performanceColor = 'var(--text-secondary)';
  if (score >= 35) {
    performanceRank = 'Grandmaster 🏆';
    performanceColor = 'var(--gold)';
  } else if (score >= 25) {
    performanceRank = 'Master 👑';
    performanceColor = 'var(--accent)';
  } else if (score >= 15) {
    performanceRank = 'Intermediate ⚔️';
    performanceColor = 'var(--success)';
  }

  const progressPercent = sessionType === 'timed' ? (timeLeft / 30) * 100 : 100;
  const timeProgressColor = timeLeft > 15 ? 'var(--success)' : timeLeft > 6 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="vision-training" data-board-theme={theme.board}>
      {/* ─── LOBBY VIEW ─── */}
      {gameState === 'lobby' && (
        <div className="vt-lobby glass">
          <div className="vt-lobby-header">
            <h1 className="vt-lobby-title">Chess Vision Trainer</h1>
            <p className="vt-lobby-desc">
              Sharpen your spatial awareness and master the coordinates to calculate lines faster.
            </p>
          </div>

          <div className="vt-lobby-grid">
            {/* Left: Exercise Selectors */}
            <div className="vt-settings-column">
              <h2 className="vt-section-title">Select Exercise</h2>
              <div className="vt-exercise-options">
                <button
                  className={`vt-exercise-card ${trainingType === 'color' ? 'active' : ''}`}
                  onClick={() => setTrainingType('color')}
                >
                  <div className="vt-card-icon">☯</div>
                  <div className="vt-card-body">
                    <h3>Square Color</h3>
                    <p>Board is invisible. Identify if a given square name is light (white) or dark (black).</p>
                  </div>
                </button>

                <button
                  className={`vt-exercise-card ${trainingType === 'coordinate' ? 'active' : ''}`}
                  onClick={() => setTrainingType('coordinate')}
                >
                  <div className="vt-card-icon">🎯</div>
                  <div className="vt-card-body">
                    <h3>Coordinate Finder</h3>
                    <p>Board is visible, but pieces are gone. Find and click the target square as fast as possible.</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Right: Practice settings */}
            <div className="vt-settings-column">
              <h2 className="vt-section-title">Session Options</h2>
              
              <div className="vt-options-box">
                {/* Time Setting */}
                <div className="vt-setting-row">
                  <span className="vt-setting-label">Game Mode</span>
                  <div className="vt-toggle-buttons">
                    <button
                      className={`vt-toggle-btn ${sessionType === 'timed' ? 'active' : ''}`}
                      onClick={() => setSessionType('timed')}
                    >
                      ⏱ 30s Timed
                    </button>
                    <button
                      className={`vt-toggle-btn ${sessionType === 'practice' ? 'active' : ''}`}
                      onClick={() => setSessionType('practice')}
                    >
                      ♾ Practice
                    </button>
                  </div>
                </div>

                {/* Coordinate Specific Settings */}
                {trainingType === 'coordinate' && (
                  <>
                    <div className="vt-setting-row">
                      <span className="vt-setting-label">Perspective</span>
                      <div className="vt-toggle-buttons">
                        <button
                          className={`vt-toggle-btn ${perspective === 'white' ? 'active' : ''}`}
                          onClick={() => setPerspective('white')}
                        >
                          White
                        </button>
                        <button
                          className={`vt-toggle-btn ${perspective === 'black' ? 'active' : ''}`}
                          onClick={() => setPerspective('black')}
                        >
                          Black
                        </button>
                        <button
                          className={`vt-toggle-btn ${perspective === 'random' ? 'active' : ''}`}
                          onClick={() => setPerspective('random')}
                        >
                          Random
                        </button>
                      </div>
                    </div>

                    <div className="vt-setting-row">
                      <span className="vt-setting-label">Show Coordinates</span>
                      <label className="vt-checkbox-wrap">
                        <input
                          type="checkbox"
                          checked={showCoordinates}
                          onChange={(e) => setShowCoordinates(e.target.checked)}
                        />
                        <span className="vt-checkmark" />
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Visible labels</span>
                      </label>
                    </div>
                  </>
                )}

                {/* High Score Panel */}
                <div className="vt-highscore-panel">
                  <span className="vt-highscore-label">⭐ High Score:</span>
                  <span className="vt-highscore-value">{highScore} points</span>
                </div>
              </div>
            </div>
          </div>

          <div className="vt-lobby-footer">
            <button className="btn btn-primary btn-lg" id="vt-start-btn" onClick={startSession}>
              ⚡ Start Training
            </button>
          </div>
        </div>
      )}

      {/* ─── ACTIVE GAMEPLAY VIEW ─── */}
      {gameState === 'active' && (
        <div className="vt-active-view">
          
          {/* Progress bar at the top */}
          {sessionType === 'timed' && (
            <div className="vt-progress-bar-wrap">
              <div 
                className="vt-progress-bar" 
                style={{ 
                  width: `${progressPercent}%`, 
                  backgroundColor: timeProgressColor 
                }} 
              />
            </div>
          )}

          {/* Top Panel: Stats & Controls */}
          <div className="vt-hud">
            <div className="vt-hud-left">
              <button className="btn btn-ghost btn-sm" id="vt-quit-btn" onClick={quitSession}>
                ✕ Quit
              </button>
              {sessionType === 'timed' ? (
                <div className="vt-timer" style={{ color: timeProgressColor }}>
                  ⏱ <strong>{timeLeft}</strong>s remaining
                </div>
              ) : (
                <div className="vt-timer">
                  ♾ Practice Mode (Untimed)
                </div>
              )}
            </div>

            <div className="vt-hud-right">
              <div className="vt-hud-stat">
                <span className="vt-stat-label">Correct</span>
                <span className="vt-stat-val success">{score}</span>
              </div>
              <div className="vt-hud-stat">
                <span className="vt-stat-label">Accuracy</span>
                <span className="vt-stat-val">{accuracy}%</span>
              </div>
              <div className="vt-hud-stat">
                <span className="vt-stat-label">Streak</span>
                <span className="vt-stat-val" style={{ color: 'var(--gold)' }}>🔥 {streak}</span>
              </div>
            </div>
          </div>

          <div className="vt-gameplay-container">
            {/* ─── CASE 1: SQUARE COLOR VIEW ─── */}
            {trainingType === 'color' && (
              <div className="vt-color-game">
                <div className="vt-prompt-card glass">
                  <span className="vt-prompt-subtitle">What is the color of the square?</span>
                  <h1 className="vt-prompt-coordinate">{currentPrompt}</h1>
                </div>

                <div className="vt-color-actions">
                  <button
                    className="vt-color-btn vt-color-btn--light"
                    id="color-btn-white"
                    onClick={() => handleAnswer('white')}
                  >
                    ⬜ Light (White)
                  </button>
                  <button
                    className="vt-color-btn vt-color-btn--dark"
                    id="color-btn-black"
                    onClick={() => handleAnswer('black')}
                  >
                    ⬛ Dark (Black)
                  </button>
                </div>
              </div>
            )}

            {/* ─── CASE 2: COORDINATE FINDER VIEW ─── */}
            {trainingType === 'coordinate' && (
              <div className="vt-coordinate-game">
                <div className="vt-board-section">
                  <div className="vt-perspective-indicator">
                    <strong>{currentPerspective === 'white' ? '⬜ White' : '⬛ Black'}</strong>
                  </div>
                  <div className="vt-board-outer">

                    {/* The 8x8 Custom Chessboard */}
                    <div className="vt-board-grid">
                      {boardSquares.map((coord) => {
                        const light = isSquareLight(coord);
                        const file = coord[0];
                        const rank = coord[1];

                        const isLeftColumn = file === boardFiles[0];
                        const isBottomRow = rank === boardRanks[7];

                        // Class list builds dynamically
                        let sqClass = `vt-board-square ${light ? 'light' : 'dark'}`;
                        if (clickedSquare === coord) {
                          sqClass += isCorrectClick ? ' flash-correct' : ' flash-incorrect';
                        }
                        if (flashCorrectSquare === coord) {
                          sqClass += ' flash-correct-guide';
                        }

                        return (
                          <div
                            key={coord}
                            className={sqClass}
                            onClick={() => handleAnswer(coord)}
                          >
                            {showCoordinates && isLeftColumn && (
                              <span className="vt-coordinate-label rank-label">{rank}</span>
                            )}
                            {showCoordinates && isBottomRow && (
                              <span className="vt-coordinate-label file-label">{file}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="vt-sidebar-section glass">
                  <span className="vt-prompt-subtitle">FIND THE SQUARE</span>
                  <h1 className="vt-coordinate-target">{currentPrompt}</h1>

                  {sessionType === 'practice' && (
                    <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: '16px' }} onClick={endSession}>
                      🏁 End & View Summary
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* History / Attempts log */}
          {history.length > 0 && (
            <div className="vt-history-panel glass">
              <span className="vt-history-title">Recent Answers</span>
              <div className="vt-history-list">
                {history.map((log) => (
                  <div key={log.id} className={`vt-history-item ${log.isCorrect ? 'correct' : 'incorrect'}`}>
                    <span className="vt-history-prompt">{log.prompt}</span>
                    <span className="vt-history-result">
                      {log.isCorrect ? '✓ Correct' : `✗ Clicked ${log.userAnswer}`}
                    </span>
                    {!log.isCorrect && (
                      <span className="vt-history-correction">
                        (Should be {log.correctAnswer})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SUMMARY VIEW ─── */}
      {gameState === 'summary' && (
        <div className="vt-summary-overlay glass">
          <div className="vt-summary-card">
            <div className="vt-summary-icon">🏆</div>
            <h1 className="vt-summary-title">Training Session Over!</h1>
            
            <div className="vt-summary-rank-box" style={{ borderColor: performanceColor }}>
              <span className="vt-summary-rank-lbl">Calculated Skill Rank</span>
              <span className="vt-summary-rank-val" style={{ color: performanceColor }}>{performanceRank}</span>
            </div>

            <div className="vt-summary-stats">
              <div className="vt-sum-stat-item">
                <span className="vt-sum-stat-val success">{score}</span>
                <span className="vt-sum-stat-lbl">Correct Answers</span>
              </div>
              <div className="vt-sum-stat-item">
                <span className="vt-sum-stat-val">{accuracy}%</span>
                <span className="vt-sum-stat-lbl">Accuracy</span>
              </div>
              <div className="vt-sum-stat-item">
                <span className="vt-sum-stat-val">{avgSpeed}s</span>
                <span className="vt-sum-stat-lbl">Avg Speed</span>
              </div>
              <div className="vt-sum-stat-item">
                <span className="vt-sum-stat-val" style={{ color: 'var(--gold)' }}>🔥 {bestStreak}</span>
                <span className="vt-sum-stat-lbl">Max Streak</span>
              </div>
            </div>

            <div className="vt-summary-btns">
              <button className="btn btn-primary" id="vt-retry-btn" onClick={startSession}>
                🔄 Play Again
              </button>
              <button className="btn btn-ghost" id="vt-lobby-btn" onClick={quitSession}>
                ⚙️ Change Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
