import './Header.css';
import { Opening, AppView } from '../../types';

interface HeaderProps {
  selectedOpening?: Opening | null;
  view: AppView;
  onBack?: () => void;
  onShowThemes: () => void;
  onViewChange: (view: AppView) => void;
}

export default function Header({ selectedOpening, view, onBack, onShowThemes, onViewChange }: HeaderProps) {
  return (
    <header className="header">
      <a className="header-logo" href="/" onClick={(e) => { e.preventDefault(); onViewChange('list'); }}>
        <div className="header-logo-icon">♟</div>
        <div className="header-logo-text">
          <span className="header-logo-title">Chess Trainer</span>
          <span className="header-logo-sub">Opening Repertoire</span>
        </div>
      </a>

      {selectedOpening && view !== 'list' && view !== 'vision' && (
        <div className="header-opening-info">
          <span className="badge badge-gold">{selectedOpening.eco}</span>
          <span className="header-opening-name">{selectedOpening.name}</span>
        </div>
      )}

      {/* Navigation tabs */}
      <nav className="header-nav">
        <button
          className={`header-nav-btn ${view !== 'vision' ? 'active' : ''}`}
          onClick={() => onViewChange('list')}
        >
          📖 Repertoire
        </button>
        <button
          className={`header-nav-btn ${view === 'vision' ? 'active' : ''}`}
          onClick={() => onViewChange('vision')}
        >
          🎯 Vision Training
        </button>
      </nav>

      <div className="header-spacer" />

      <div className="header-actions">
        {view !== 'list' && view !== 'vision' && onBack && (
          <button className="header-back-btn" onClick={onBack}>
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
