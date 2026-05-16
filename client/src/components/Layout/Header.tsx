import './Header.css';
import { Opening } from '../../types';

interface HeaderProps {
  selectedOpening?: Opening | null;
  view: 'list' | 'theory' | 'exercise';
  onBack?: () => void;
  onShowThemes: () => void;
}

export default function Header({ selectedOpening, view, onBack, onShowThemes }: HeaderProps) {
  return (
    <header className="header">
      <a className="header-logo" href="/">
        <div className="header-logo-icon">♟</div>
        <div className="header-logo-text">
          <span className="header-logo-title">Chess Trainer</span>
          <span className="header-logo-sub">Opening Repertoire</span>
        </div>
      </a>

      {selectedOpening && view !== 'list' && (
        <div className="header-opening-info">
          <span className="badge badge-gold">{selectedOpening.eco}</span>
          <span className="header-opening-name">{selectedOpening.name}</span>
        </div>
      )}

      <div className="header-spacer" />

      <div className="header-actions">
        {view !== 'list' && onBack && (
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
