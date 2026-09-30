import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Layout/Header';
import OpeningList from './components/OpeningList/OpeningList';
import MastersLayout from './components/MastersMode/MastersMode';
import PlayerBrowser from './components/MastersMode/PlayerBrowser';
import MasterExplorerPage from './components/MastersMode/MasterExplorerPage';
import FamilyPage from './pages/FamilyPage';
import OpeningGamesBrowser from './components/OpeningGames/OpeningGamesBrowser';
import ThemeSelector from './components/ThemeSelector/ThemeSelector';
import { useTheme } from './hooks/useTheme';

// Heavy routes are code-split so the initial bundle (repertoire + masters
// lists) stays small and paints fast on slow connections. These chunks load
// on demand when the user navigates to them.
const TheoryPage = lazy(() => import('./pages/TheoryPage'));
const ExercisePage = lazy(() => import('./pages/ExercisePage'));
const MasterGuessTrainerPage = lazy(() => import('./components/MastersMode/MasterGuessTrainerPage'));
const VisionTraining = lazy(() => import('./components/VisionTraining/VisionTraining'));
const PlayWithCoach = lazy(() => import('./components/CoachGame/PlayWithCoach'));
const GameReview = lazy(() => import('./components/GameReview/GameReview'));

function RouteFallback() {
  return (
    <div className="loading-center">
      <div className="spinner" />
      <span>Loading…</span>
    </div>
  );
}

export default function App() {
  const [showThemePanel, setShowThemePanel] = useState(false);
  const { theme, setBoardTheme, setPieceTheme, setAppMode } = useTheme();

  return (
    <div className="app-container">
      <Header onShowThemes={() => setShowThemePanel(true)} />

      <main className="app-main">
        <Suspense fallback={<RouteFallback />}>
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
        </Suspense>
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
    </div>
  );
}
