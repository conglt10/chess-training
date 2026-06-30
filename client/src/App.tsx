import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Layout/Header';
import OpeningList from './components/OpeningList/OpeningList';
import VisionTraining from './components/VisionTraining/VisionTraining';
import PlayWithCoach from './components/CoachGame/PlayWithCoach';
import GameReview from './components/GameReview/GameReview';
import MastersLayout from './components/MastersMode/MastersMode';
import PlayerBrowser from './components/MastersMode/PlayerBrowser';
import MasterExplorerPage from './components/MastersMode/MasterExplorerPage';
import MasterGuessTrainerPage from './components/MastersMode/MasterGuessTrainerPage';
import TheoryPage from './pages/TheoryPage';
import ExercisePage from './pages/ExercisePage';
import FamilyPage from './pages/FamilyPage';
import OpeningGamesBrowser from './components/OpeningGames/OpeningGamesBrowser';
import ThemeSelector from './components/ThemeSelector/ThemeSelector';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const [showThemePanel, setShowThemePanel] = useState(false);
  const { theme, setBoardTheme, setPieceTheme, setAppMode } = useTheme();

  return (
    <>
      <Header onShowThemes={() => setShowThemePanel(true)} />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/repertoire" replace />} />
          <Route path="/repertoire" element={<OpeningList />} />
          <Route path="/repertoire/family/:family" element={<FamilyPage />} />
          <Route path="/repertoire/games" element={<OpeningGamesBrowser />} />
          <Route path="/repertoire/games/:openingKey" element={<OpeningGamesBrowser />} />

          <Route path="/openings/:eco/:name" element={<TheoryPage theme={theme} onAppMode={setAppMode} />} />
          <Route path="/openings/:eco/:name/exercise" element={<ExercisePage theme={theme} />} />

          <Route path="/masters" element={<MastersLayout theme={theme} />}>
            <Route index element={<Navigate to="players" replace />} />
            <Route path="players" element={<PlayerBrowser />} />
            <Route path="players/:collectionKey" element={<PlayerBrowser />} />
            <Route path="explore" element={<MasterExplorerPage />} />
          </Route>
          <Route path="/masters/game/:gameId" element={<MasterGuessTrainerPage theme={theme} />} />

          <Route path="/vision" element={<VisionTraining theme={theme} />} />
          <Route path="/coach" element={<PlayWithCoach theme={theme} />} />
          <Route path="/review" element={<GameReview theme={theme} />} />

          <Route path="*" element={<Navigate to="/repertoire" replace />} />
        </Routes>
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
