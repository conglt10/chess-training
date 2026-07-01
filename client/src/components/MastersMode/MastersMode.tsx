import { NavLink, Outlet } from 'react-router-dom';
import { ThemeConfig } from '../../types';
import './MastersMode.css';

export interface MastersOutletCtx {
  theme: ThemeConfig;
}

interface MastersLayoutProps {
  theme: ThemeConfig;
}

/** Layout for the Masters mode: intro + tab links + nested route outlet. */
export default function MastersLayout({ theme }: MastersLayoutProps) {
  return (
    <div className="masters-mode">
      <div className="masters-intro">
        <div className="masters-intro-text">
          <h2>Train with Master Games</h2>
          <p>Pick a legendary champion and guess their moves in real games, or explore how strong players handle any opening.</p>
        </div>
      </div>

      <div className="masters-tabs">
        <NavLink to="/masters/players" className={({ isActive }) => `masters-tab ${isActive ? 'active' : ''}`}>
          👑 Legendary Players
        </NavLink>
        <NavLink to="/masters/explore" className={({ isActive }) => `masters-tab ${isActive ? 'active' : ''}`}>
          ♟ Explore Openings
        </NavLink>
      </div>

      <Outlet context={{ theme } satisfies MastersOutletCtx} />
    </div>
  );
}
