import './ThemeSelector.css';
import { BoardTheme, PieceTheme, ThemeConfig } from '../../types';

interface ThemeSelectorProps {
  theme: ThemeConfig;
  onBoardTheme: (t: BoardTheme) => void;
  onPieceTheme: (t: PieceTheme) => void;
  onAppMode: (m: 'light' | 'dark' | 'system') => void;
  onClose: () => void;
}

const BOARD_THEMES: { id: BoardTheme; name: string; light: string; dark: string }[] = [
  { id: 'brown',    name: 'Classic',   light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue',     name: 'Ocean',     light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'green',    name: 'Forest',    light: '#ffffdd', dark: '#86a666' },
  { id: 'purple',   name: 'Royale',    light: '#e8d5f5', dark: '#7c4d99' },
  { id: 'dark',     name: 'Midnight',  light: '#4a4a6a', dark: '#1e1e3a' },
  { id: 'ice',      name: 'Ice',       light: '#dce9f5', dark: '#5b85a4' },
  { id: 'walnut',   name: 'Walnut',    light: '#d4a96a', dark: '#6b3a1f' },
  { id: 'maple',    name: 'Maple',     light: '#f2c98a', dark: '#a0522d' },
  { id: 'mahogany', name: 'Mahogany',  light: '#c8956c', dark: '#4a1a0e' },
];

const PIECE_THEMES: { id: PieceTheme; name: string; desc: string; preview: string }[] = [
  { id: 'neo', name: 'Neo', desc: 'Chess.com Neo style', preview: '♔' },
  { id: 'wikipedia', name: 'Wikipedia', desc: 'Standard pieces', preview: '♕' },
  { id: 'alpha', name: 'Alpha', desc: 'Bold outline style', preview: '♚' },
  { id: 'uscf', name: 'USCF', desc: 'US Chess Federation', preview: '♛' },
];

function BoardPreview({ light, dark }: { light: string; dark: string }) {
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      cells.push(
        <div
          key={`${r}-${c}`}
          className="board-preview-cell"
          style={{ background: (r + c) % 2 === 0 ? light : dark }}
        />
      );
    }
  }
  return <div className="board-preview">{cells}</div>;
}

export default function ThemeSelector({ theme, onBoardTheme, onPieceTheme, onAppMode, onClose }: ThemeSelectorProps) {
  return (
    <div className="theme-overlay" onClick={onClose}>
      <div className="theme-panel" onClick={e => e.stopPropagation()}>
        <div className="theme-panel-header">
          <div className="theme-panel-title">🎨 Board Themes</div>
          <button className="theme-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="theme-section">
          <div className="theme-section-label">Board Colors</div>
          <div className="board-theme-grid">
            {BOARD_THEMES.map(t => (
              <button
                key={t.id}
                className={`board-theme-option ${theme.board === t.id ? 'active' : ''}`}
                onClick={() => onBoardTheme(t.id)}
                id={`board-theme-${t.id}`}
              >
                <BoardPreview light={t.light} dark={t.dark} />
                <span className="board-theme-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="theme-section">
          <div className="theme-section-label">App Appearance</div>
          <div className="app-mode-options">
            {(['light', 'dark', 'system'] as const).map(m => (
              <button
                key={m}
                className={`app-mode-btn ${theme.mode === m ? 'active' : ''}`}
                onClick={() => onAppMode(m)}
              >
                <span className="app-mode-icon">
                  {m === 'light' ? '☀️' : m === 'dark' ? '🌙' : '🖥️'}
                </span>
                <span className="app-mode-name">{m}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="theme-section">
          <div className="theme-section-label">Piece Style</div>
          <div className="piece-theme-list">
            {PIECE_THEMES.map(p => (
              <button
                key={p.id}
                className={`piece-theme-option ${theme.pieces === p.id ? 'active' : ''}`}
                onClick={() => onPieceTheme(p.id)}
                id={`piece-theme-${p.id}`}
              >
                <span className="piece-preview">{p.preview}</span>
                <div className="piece-theme-info">
                  <div className="piece-theme-name">{p.name}</div>
                  <div className="piece-theme-desc">{p.desc}</div>
                </div>
                {theme.pieces === p.id && <span className="piece-check">✓</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
