import { useState, useEffect, useMemo } from 'react';
import './MostPopularOpenings.css';
import { Opening } from '../../types';
import { fetchOpeningsByFamilies } from '../../api/openings';

interface MostPopularOpeningsProps {
  onSelect: (opening: Opening) => void;
  onSelectFamily: (familyData: {
    name: string;
    variations: Opening[];
    description?: string;
    badge?: string;
    color?: string;
    icon?: string;
  }) => void;
}

// ── Curated list from chess.com/openings ─────────────────────────────────────
interface CuratedEntry {
  family: string;         // matches Opening.family in the DB
  desc: string;
  badge?: string;         // optional label e.g. "Aggressive", "Solid"
}

interface CuratedGroup {
  id: string;
  label: string;
  move: string;
  color: string;
  icon: string;
  whiteWin: number;
  draw: number;
  blackWin: number;
  openings: CuratedEntry[];
}

const CURATED: CuratedGroup[] = [
  {
    id: 'e4',
    label: '1.e4 — King\'s Pawn',
    move: '1. e4',
    color: '#6c8aff',
    icon: '♙',
    whiteWin: 39,
    draw: 28,
    blackWin: 33,
    openings: [
      { family: 'Sicilian Defense',      desc: 'The most popular response to 1.e4 — rich, asymmetric battles.',         badge: 'Most Popular' },
      { family: 'French Defense',         desc: 'Solid and strategic; Black builds a pawn chain with …e6.',              badge: 'Solid' },
      { family: 'Ruy Lopez',              desc: 'One of the oldest and most classical openings in chess.',               badge: 'Classical' },
      { family: 'Caro-Kann Defense',      desc: 'A resilient defense that avoids early tactical complications.',         badge: 'Resilient' },
      { family: 'Italian Game',           desc: 'Fast development and central control — great for beginners.',           badge: 'Beginner Friendly' },
      { family: 'Scandinavian Defense',   desc: 'Black immediately challenges the center with …d5.',                    badge: 'Aggressive' },
      { family: 'Pirc Defense',           desc: 'Hypermodern — Black lets White build a big center then attacks it.',    badge: 'Hypermodern' },
      { family: 'Alekhine Defense',      desc: 'Provocative — Black invites White to overextend.',                     badge: 'Provocative' },
      { family: "King's Gambit",          desc: 'A romantic gambit aiming for a lightning attack.',                     badge: 'Gambit' },
      { family: 'Scotch Game',            desc: 'White opens the center early, leading to sharp play.',                 badge: 'Sharp' },
      { family: 'Vienna Game',            desc: 'A flexible opening with many transpositional possibilities.',          badge: 'Flexible' },
      { family: "Bishop's Opening",       desc: 'Simple and solid — develop the bishop and control the center.',        badge: 'Solid' },
    ],
  },
  {
    id: 'd4',
    label: '1.d4 — Queen\'s Pawn',
    move: '1. d4',
    color: '#f59e0b',
    icon: '♟',
    whiteWin: 39,
    draw: 31,
    blackWin: 30,
    openings: [
      { family: "Queen's Gambit",         desc: 'White offers a pawn to gain rapid center control.',                    badge: 'Classical' },
      { family: 'Slav Defense',           desc: 'Solid response to the Queen\'s Gambit with …c6.',                     badge: 'Solid' },
      { family: "King's Indian Defense",  desc: 'Black allows White a big center and then counterattacks.',             badge: 'Dynamic' },
      { family: 'Nimzo-Indian Defense',   desc: 'Black pins the knight and fights for the center indirectly.',         badge: 'Strategic' },
      { family: 'Dutch Defense',          desc: 'Unbalanced — Black fights for kingside space from move one.',          badge: 'Aggressive' },
      { family: 'Grünfeld Defense',       desc: 'Black builds a hypermodern pawn break in the center.',               badge: 'Hypermodern' },
      { family: "Queen's Indian Defense", desc: 'Flexible and solid — Black controls key light squares.',              badge: 'Flexible' },
      { family: 'Benoni Defense',         desc: 'Sharp and double-edged; Black creates an immediate imbalance.',       badge: 'Sharp' },
      { family: 'London System',          desc: 'A solid, easy-to-learn setup for White with Bf4 and Nf3.',           badge: 'Beginner Friendly' },
      { family: 'Trompowsky Attack',      desc: 'White avoids main lines by attacking the knight on f6.',             badge: 'Sideline' },
      { family: 'Catalan Opening',        desc: 'White combines the Queen\'s Gambit with a fianchetto.',              badge: 'Positional' },
    ],
  },
  {
    id: 'other',
    label: 'Other — Flank & Hypermodern',
    move: '1. c4 / 1. Nf3 / …',
    color: '#10b981',
    icon: '♞',
    whiteWin: 40,
    draw: 32,
    blackWin: 28,
    openings: [
      { family: 'English Opening',        desc: 'A flexible flank opening with many transpositions.',                  badge: '1. c4' },
      { family: 'Réti Opening',           desc: 'Hypermodern — control the center from a distance.',                   badge: '1. Nf3' },
      { family: 'Bird Opening',           desc: 'A unique flank opening aiming for a kingside attack.',               badge: '1. f4' },
      { family: 'Nimzo-Larsen Attack',    desc: 'Provocative and original — White fianchettos the queen bishop.',     badge: '1. b3' },
      { family: "King's Indian Attack",   desc: 'A reversed King\'s Indian — White builds a solid setup.',           badge: 'Reversed' },
      { family: 'Polish Opening',         desc: 'The unusual 1.b4 — aiming to grab queenside space.',                 badge: '1. b4' },
      { family: 'Grob Opening',           desc: 'The wild 1.g4 — risky but surprising.',                             badge: '1. g4' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

// Per-group opening cache: groupId → family → Opening[]
type GroupCache = Record<string, Record<string, Opening[]>>;

export default function MostPopularOpenings({ onSelect, onSelectFamily }: MostPopularOpeningsProps) {
  const [activeGroup, setActiveGroup] = useState<string>('e4');
  // Each group loads lazily on first visit
  const [groupCache, setGroupCache] = useState<GroupCache>({});
  const [loadingGroup, setLoadingGroup] = useState<string | null>('e4');

  const currentGroup = CURATED.find(g => g.id === activeGroup)!;

  // Fetch the current group's families the first time it is selected
  useEffect(() => {
    if (groupCache[activeGroup]) return;       // already loaded
    let cancelled = false;
    setLoadingGroup(activeGroup);

    const families = CURATED.find(g => g.id === activeGroup)!.openings.map(e => e.family);

    fetchOpeningsByFamilies(families)
      .then(openings => {
        if (cancelled) return;
        // Build family index for this group
        const index: Record<string, Opening[]> = {};
        for (const o of openings) {
          // The server now returns the family field. We use it to group.
          const key = o.family.toLowerCase().trim();
          if (!index[key]) index[key] = [];
          index[key].push(o);
        }
        setGroupCache(prev => ({ ...prev, [activeGroup]: index }));
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoadingGroup(null); });

    return () => { cancelled = true; };
  }, [activeGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  const dbByFamily = useMemo(
    () => groupCache[activeGroup] ?? {},
    [groupCache, activeGroup]
  );

  const loading = loadingGroup === activeGroup && !groupCache[activeGroup];

  function getVariations(family: string): Opening[] {
    return dbByFamily[family.toLowerCase()] ?? [];
  }

  return (
    <div className="mpo-container">

      {/* Group tabs */}
      <div className="mpo-group-tabs">
        {CURATED.map(g => (
          <button
            key={g.id}
            id={`mpo-group-${g.id}`}
            className={`mpo-group-tab ${activeGroup === g.id ? 'mpo-group-tab--active' : ''}`}
            style={{ '--g-color': g.color } as React.CSSProperties}
            onClick={() => setActiveGroup(g.id)}
          >
            <span className="mpo-group-tab-icon">{g.icon}</span>
            <span className="mpo-group-tab-label">{g.move}</span>
          </button>
        ))}
      </div>

      {/* Group header */}
      <div className="mpo-group-header" style={{ '--g-color': currentGroup.color } as React.CSSProperties}>
        <div className="mpo-group-header-left">
          <div className="mpo-group-header-icon">{currentGroup.icon}</div>
          <div>
            <h2 className="mpo-group-header-title">{currentGroup.label}</h2>
            <p className="mpo-group-header-sub">
              {currentGroup.openings.length} major openings · click any to see all variations
            </p>
          </div>
        </div>

        {/* Win-rate bar */}
        <div className="mpo-winbar-wrap">
          <div className="mpo-winbar">
            <div
              className="mpo-winbar-seg mpo-winbar-white"
              style={{ width: `${currentGroup.whiteWin}%` }}
              title={`White wins ${currentGroup.whiteWin}%`}
            >
              {currentGroup.whiteWin}%
            </div>
            <div
              className="mpo-winbar-seg mpo-winbar-draw"
              style={{ width: `${currentGroup.draw}%` }}
              title={`Draw ${currentGroup.draw}%`}
            >
              {currentGroup.draw}%
            </div>
            <div
              className="mpo-winbar-seg mpo-winbar-black"
              style={{ width: `${currentGroup.blackWin}%` }}
              title={`Black wins ${currentGroup.blackWin}%`}
            >
              {currentGroup.blackWin}%
            </div>
          </div>
          <div className="mpo-winbar-legend">
            <span className="mpo-wbl mpo-wbl--white">■ White</span>
            <span className="mpo-wbl mpo-wbl--draw">■ Draw</span>
            <span className="mpo-wbl mpo-wbl--black">■ Black</span>
          </div>
        </div>
      </div>

      {/* Opening list */}
      <div className="mpo-body">
        {loading ? (
          <div className="loading-center">
            <div className="spinner" />
            <span>Loading openings database…</span>
          </div>
        ) : (
          <div className="mpo-list">
            {currentGroup.openings.map((entry, idx) => {
              const variations = getVariations(entry.family);
              const hasVariations = variations.length > 0;

              return (
                <div
                  key={entry.family}
                  className="mpo-entry"
                  style={{ '--g-color': currentGroup.color } as React.CSSProperties}
                >
                  <button
                    id={`mpo-entry-${idx}`}
                    className="mpo-entry-header"
                    onClick={() =>
                      hasVariations &&
                      onSelectFamily({
                        name: entry.family,
                        variations,
                        description: entry.desc,
                        badge: entry.badge,
                        color: currentGroup.color,
                        icon: currentGroup.icon,
                      })
                    }
                  >
                    {/* Rank number */}
                    <span className="mpo-entry-rank" style={{ color: currentGroup.color }}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>

                    {/* Name + description */}
                    <div className="mpo-entry-info">
                      <span className="mpo-entry-name">{entry.family}</span>
                      <span className="mpo-entry-desc">{entry.desc}</span>
                    </div>

                    {/* Badge */}
                    {entry.badge && (
                      <span
                        className="mpo-entry-badge"
                        style={{
                          background: `color-mix(in srgb, ${currentGroup.color} 15%, transparent)`,
                          color: currentGroup.color,
                          borderColor: `color-mix(in srgb, ${currentGroup.color} 40%, transparent)`,
                        }}
                      >
                        {entry.badge}
                      </span>
                    )}

                    {/* Variation count pill */}
                    {hasVariations && (
                      <span className="mpo-entry-varcount">
                        {variations.length} var.
                      </span>
                    )}

                    {/* Chevron */}
                    {hasVariations && (
                      <span className="mpo-entry-chevron">›</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
