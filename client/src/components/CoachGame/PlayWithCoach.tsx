import { useState } from 'react';
import CoachSetup from './CoachSetup';
import CoachGame from './CoachGame';
import type { ThemeConfig } from '../../types';
import type { CoachLevel } from '../../utils/chessAI';

interface PlayWithCoachProps {
  theme: ThemeConfig;
}

type CoachScreen = 'setup' | 'game';

export default function PlayWithCoach({ theme }: PlayWithCoachProps) {
  const [screen, setScreen] = useState<CoachScreen>('setup');
  const [level, setLevel] = useState<CoachLevel>('intermediate');
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');

  const handleStart = (chosenLevel: CoachLevel, chosenColor: 'white' | 'black') => {
    setLevel(chosenLevel);
    setPlayerColor(chosenColor);
    setScreen('game');
  };

  if (screen === 'setup') {
    return <CoachSetup onStart={handleStart} />;
  }

  return (
    <CoachGame
      level={level}
      playerColor={playerColor}
      theme={theme}
      onNewGame={() => setScreen('setup')}
    />
  );
}
