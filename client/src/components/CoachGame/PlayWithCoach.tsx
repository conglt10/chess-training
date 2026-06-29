import { useState } from 'react';
import CoachSetup from './CoachSetup';
import CoachGame from './CoachGame';
import GameReview from '../GameReview/GameReview';
import type { ThemeConfig } from '../../types';
import type { CoachLevel } from '../../utils/chessAI';

interface PlayWithCoachProps {
  theme: ThemeConfig;
}

type CoachScreen = 'setup' | 'game' | 'review';

export default function PlayWithCoach({ theme }: PlayWithCoachProps) {
  const [screen, setScreen] = useState<CoachScreen>('setup');
  const [level, setLevel] = useState<CoachLevel>('intermediate');
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [strictMode, setStrictMode] = useState(false);
  const [reviewPgn, setReviewPgn] = useState<string | null>(null);

  const handleStart = (
    chosenLevel: CoachLevel,
    chosenColor: 'white' | 'black',
    chosenStrictMode: boolean,
  ) => {
    setLevel(chosenLevel);
    setPlayerColor(chosenColor);
    setStrictMode(chosenStrictMode);
    setScreen('game');
  };

  if (screen === 'setup') {
    return <CoachSetup onStart={handleStart} />;
  }

  if (screen === 'review' && reviewPgn) {
    return (
      <GameReview
        theme={theme}
        initialPgn={reviewPgn}
        initialOrientation={playerColor}
        onExit={() => { setReviewPgn(null); setScreen('setup'); }}
        exitLabel="← New game"
      />
    );
  }

  return (
    <CoachGame
      level={level}
      playerColor={playerColor}
      strictMode={strictMode}
      theme={theme}
      onNewGame={() => setScreen('setup')}
      onReview={(pgn) => { setReviewPgn(pgn); setScreen('review'); }}
    />
  );
}
