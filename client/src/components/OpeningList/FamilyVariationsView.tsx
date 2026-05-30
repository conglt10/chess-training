import { Opening } from '../../types';
import './FamilyVariationsView.css';

interface FamilyVariationsViewProps {
  family: string;
  variations: Opening[];
  color: string;
  onSelect: (opening: Opening) => void;
  onBack: () => void;
}

export default function FamilyVariationsView({
  family,
  variations,
  color,
  onSelect,
  onBack,
}: FamilyVariationsViewProps) {
  return (
    <div className="fvv-container">
      {/* Header */}
      <div className="fvv-header" style={{ '--fvv-color': color } as React.CSSProperties}>
        <button className="fvv-back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="fvv-header-info">
          <h2 className="fvv-title">{family}</h2>
          <p className="fvv-subtitle">
            {variations.length} variation{variations.length !== 1 ? 's' : ''} — click any to study
          </p>
        </div>
        <div className="fvv-count-badge" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}>
          {variations.length}
        </div>
      </div>

      {/* Grid of variation cards */}
      <div className="fvv-body">
        <div className="fvv-grid">
          {variations.map((opening, i) => (
            <button
              key={`${opening.eco}-${i}`}
              id={`fvv-card-${opening.eco}-${i}`}
              className="fvv-card"
              style={{ '--fvv-color': color } as React.CSSProperties}
              onClick={() => onSelect(opening)}
            >
              <div className="fvv-card-top">
                <span className="fvv-card-name">{opening.name}</span>
                <span className="badge badge-gold">{opening.eco}</span>
              </div>
              <div className="fvv-card-moves">
                {opening.moves.slice(0, 10).map((m, mi) => (
                  <span key={mi} className="move-chip">{m}</span>
                ))}
                {opening.moves.length > 10 && (
                  <span className="move-chip">+{opening.moves.length - 10}</span>
                )}
              </div>
              <div className="fvv-card-footer">
                <span className="badge badge-accent">{Math.ceil(opening.moves.length / 2)} moves</span>
                <span className="fvv-card-plies">{opening.moves.length} plies</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
