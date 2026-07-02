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
    <>
      {/* Mobile Top Bar */}
      <div className="mobile-top-bar">
        <a className="header-logo" href="/repertoire" onClick={(e) => { e.preventDefault(); navigate(repertoirePath()); }}>
          <div className="header-logo-icon">♟</div>
          <span className="header-logo-title">Chess Trainer</span>
        </a>
        <div className="mobile-top-actions">
          {openingMatch && (
            <span className="badge badge-gold" style={{ marginRight: '8px' }}>{openingMatch.params.eco}</span>
          )}
          <button className="btn btn-ghost btn-sm theme-btn-circle" onClick={onShowThemes} id="theme-selector-btn-mobile">
            🎨
          </button>
        </div>
      </div>

      {/* Main Header / Sidebar */}
      <header className="header">
        <div className="sidebar-top">
          <a className="header-logo" href="/repertoire" onClick={(e) => { e.preventDefault(); navigate(repertoirePath()); }}>
            <div className="header-logo-icon">♟</div>
            <div className="header-logo-text">
              <span className="header-logo-title">Chess Trainer</span>
              <span className="header-logo-sub">Opening Trainer</span>
            </div>
          </a>
        </div>

        {/* Navigation tabs */}
        <nav className="header-nav">
          <button className={`header-nav-btn ${isRepertoire ? 'active' : ''}`} onClick={() => navigate('/repertoire')}>
            <span className="nav-icon">📖</span> <span className="nav-text">Repertoire</span>
          </button>
          <button className={`header-nav-btn ${isMasters ? 'active' : ''}`} onClick={() => navigate('/masters')}>
            <span className="nav-icon">♚</span> <span className="nav-text">Master Games</span>
          </button>
          <button className={`header-nav-btn ${isVision ? 'active' : ''}`} onClick={() => navigate('/vision')}>
            <span className="nav-icon">🎯</span> <span className="nav-text">Vision Training</span>
          </button>
          <button className={`header-nav-btn ${isCoach ? 'active' : ''}`} onClick={() => navigate('/coach')}>
            <span className="nav-icon">🤖</span> <span className="nav-text">Play Coach</span>
          </button>
          <button className={`header-nav-btn ${isReview ? 'active' : ''}`} onClick={() => navigate('/review')}>
            <span className="nav-icon">🔍</span> <span className="nav-text">Game Review</span>
          </button>
        </nav>

        {openingMatch && (
          <div className="sidebar-study-widget">
            <div className="widget-label">ACTIVE STUDY</div>
            <div className="widget-details">
              <span className="badge badge-gold">{openingMatch.params.eco}</span>
              <div className="widget-opening-name" title={openingMatch.params.name}>
                {openingMatch.params.name}
              </div>
            </div>
            {theoryMatch ? (
              <button className="header-back-btn" onClick={() => navigate(repertoirePath())}>
                ← Back to Openings
              </button>
            ) : (
              <button className="header-back-btn" onClick={() => navigate(`/openings/${openingMatch.params.eco}/${openingMatch.params.name}`)}>
                📖 Back to Theory
              </button>
            )}
          </div>
        )}

        <div className="header-spacer" />

        <div className="sidebar-bottom">
          <button className="btn btn-ghost theme-btn" onClick={onShowThemes} id="theme-selector-btn">
            <span className="btn-icon">🎨</span> <span className="btn-text">Themes & Settings</span>
          </button>
        </div>
      </header>
    </>
  );
}
