import { useState } from 'react';
import Header from './components/Layout/Header';
import OpeningList from './components/OpeningList/OpeningList';
import TheoryView from './components/TheoryView/TheoryView';
import ExerciseView from './components/ExerciseView/ExerciseView';
import ThemeSelector from './components/ThemeSelector/ThemeSelector';
import { useTheme } from './hooks/useTheme';
import { AppView, Opening } from './types';

export default function App() {
  const [view, setView] = useState<AppView>('list');
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const { theme, setBoardTheme, setPieceTheme } = useTheme();

  const handleSelectOpening = (opening: Opening) => {
    setSelectedOpening(opening);
    setView('theory');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedOpening(null);
  };

  const handleStartExercise = () => {
    setView('exercise');
  };

  const handleBackToTheory = () => {
    setView('theory');
  };

  return (
    <>
      <Header
        view={view}
        selectedOpening={selectedOpening}
        onBack={view === 'theory' ? handleBackToList : undefined}
        onShowThemes={() => setShowThemePanel(true)}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {view === 'list' && (
          <OpeningList onSelect={handleSelectOpening} />
        )}
        {view === 'theory' && selectedOpening && (
          <TheoryView
            opening={selectedOpening}
            theme={theme}
            onStartExercise={handleStartExercise}
          />
        )}
        {view === 'exercise' && selectedOpening && (
          <ExerciseView
            opening={selectedOpening}
            theme={theme}
            onBackToTheory={handleBackToTheory}
          />
        )}
      </main>

      {showThemePanel && (
        <ThemeSelector
          theme={theme}
          onBoardTheme={setBoardTheme}
          onPieceTheme={setPieceTheme}
          onClose={() => setShowThemePanel(false)}
        />
      )}
    </>
  );
}
