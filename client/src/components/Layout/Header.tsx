import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import './Header.css';
import { repertoirePath } from '../../paths';

interface HeaderProps {
  onShowThemes: () => void;
}

export default function Header({ onShowThemes }: HeaderProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isRepertoire =
    pathname === '/' || pathname.startsWith('/repertoire') || pathname.startsWith('/openings');
  const isMasters = pathname.startsWith('/masters');
  const isVision = pathname.startsWith('/vision');
  const isCoach = pathname.startsWith('/coach');
  const isReview = pathname.startsWith('/review');

  // Opening badge (theory + exercise) and the back button (theory only).
  const openingMatch = useMatch('/openings/:eco/:name/*');
  const theoryMatch = useMatch('/openings/:eco/:name');

  return (
    <header className="header">
      <a className="header-logo" href="/repertoire" onClick={(e) => { e.preventDefault(); navigate(repertoirePath()); }}>
        <div className="header-logo-icon">♟</div>
        <div className="header-logo-text">
          <span className="header-logo-title">Chess Trainer</span>
          <span className="header-logo-sub">Opening Repertoire</span>
        </div>
      </a>

      {openingMatch && (
        <div className="header-opening-info">
          <span className="badge badge-gold">{openingMatch.params.eco}</span>
          <span className="header-opening-name">{openingMatch.params.name}</span>
        </div>
      )}

      {/* Navigation tabs */}
      <nav className="header-nav">
        <button className={`header-nav-btn ${isRepertoire ? 'active' : ''}`} onClick={() => navigate('/repertoire')}>
          📖 Repertoire
        </button>
        <button className={`header-nav-btn ${isMasters ? 'active' : ''}`} onClick={() => navigate('/masters')}>
          ♚ Master Games
        </button>
        <button className={`header-nav-btn ${isVision ? 'active' : ''}`} onClick={() => navigate('/vision')}>
          🎯 Vision Training
        </button>
        <button className={`header-nav-btn ${isCoach ? 'active' : ''}`} onClick={() => navigate('/coach')}>
          🤖 Play with Coach
        </button>
        <button className={`header-nav-btn ${isReview ? 'active' : ''}`} onClick={() => navigate('/review')}>
          🔍 Game Review
        </button>
      </nav>

      <div className="header-spacer" />

      <div className="header-actions">
        {theoryMatch && (
          <button className="header-back-btn" onClick={() => navigate(repertoirePath())}>
            ← Back to Openings
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onShowThemes} id="theme-selector-btn">
          🎨 Themes
        </button>
      </div>
    </header>
  );
}
