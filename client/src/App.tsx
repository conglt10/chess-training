import { useState, useEffect } from 'react';
import Header from './components/Layout/Header';
import OpeningList from './components/OpeningList/OpeningList';
import TheoryView from './components/TheoryView/TheoryView';
import ExerciseView from './components/ExerciseView/ExerciseView';
import VisionTraining from './components/VisionTraining/VisionTraining';
import PlayWithCoach from './components/CoachGame/PlayWithCoach';
import ThemeSelector from './components/ThemeSelector/ThemeSelector';
import { useTheme } from './hooks/useTheme';
import { AppView, Opening } from './types';

const VIEW_STORAGE_KEY = 'chess-trainer-view';
const OPENING_STORAGE_KEY = 'chess-trainer-opening';

export default function App() {
  const [view, setView] = useState<AppView>(() => {
    return (localStorage.getItem(VIEW_STORAGE_KEY) as AppView) || 'list';
  });
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(() => {
    const stored = localStorage.getItem(OPENING_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [selectedFamily, setSelectedFamily] = useState<{ family: string; variations: Opening[]; color: string } | null>(null);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const { theme, setBoardTheme, setPieceTheme, setAppMode } = useTheme();

  // Handle ?#opening=<encoded> links (e.g. opened in new tab from FamilyVariationsView)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#opening=')) {
      try {
        const opening: Opening = JSON.parse(decodeURIComponent(hash.slice('#opening='.length)));
        setSelectedOpening(opening);
        setView('theory');
      } catch {
        // Ignore malformed hash
      }
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    if (selectedOpening) {
      localStorage.setItem(OPENING_STORAGE_KEY, JSON.stringify(selectedOpening));
    } else {
      localStorage.removeItem(OPENING_STORAGE_KEY);
    }
  }, [selectedOpening]);

  const handleSelectOpening = (opening: Opening) => {
    setSelectedOpening(opening);
    setView('theory');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedOpening(null);
    // selectedFamily is intentionally preserved so the user returns to the family variations page
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
        onViewChange={setView}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {view === 'list' && (
          <OpeningList
            onSelect={handleSelectOpening}
            selectedFamily={selectedFamily}
            onFamilySelect={setSelectedFamily}
            onFamilyClear={() => setSelectedFamily(null)}
          />
        )}
        {view === 'theory' && selectedOpening && (
          <TheoryView
            opening={selectedOpening}
            theme={theme}
            onStartExercise={handleStartExercise}
            onAppMode={setAppMode}
          />
        )}
        {view === 'exercise' && selectedOpening && (
          <ExerciseView
            opening={selectedOpening}
            theme={theme}
            onBackToTheory={handleBackToTheory}
          />
        )}
        {view === 'vision' && (
          <VisionTraining theme={theme} />
        )}
        {view === 'coach' && (
          <PlayWithCoach theme={theme} />
        )}
      </main>

      {showThemePanel && (
        <ThemeSelector
          theme={theme}
          onBoardTheme={setBoardTheme}
          onPieceTheme={setPieceTheme}
          onAppMode={setAppMode}
          onClose={() => setShowThemePanel(false)}
        />
      )}
    </>
  );
}
