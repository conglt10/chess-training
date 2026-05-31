/**
 * moveCommentator.ts
 *
 * Generates coaching commentary from real Stockfish analysis data.
 * Quality is determined by centipawn loss vs the engine's top recommended move.
 */

import type { CoachLevel } from './chessAI';
import type { AnalysisResult } from './stockfishService';

// ── Public types ───────────────────────────────────────────────────────────────

export type MoveQuality = 'brilliant' | 'great' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveComment {
  quality: MoveQuality;
  /** Annotation symbol (!! ! ?! ? ??) */
  symbol: string;
  /** Main coaching message */
  text: string;
  /** Optional instructional tip */
  tip?: string;
  /** Best alternative move in UCI format, when player deviated */
  bestAlternative?: string;
  /** Centipawn loss vs best move (0 = perfect) */
  cpLoss: number;
}

// ── Quality thresholds ─────────────────────────────────────────────────────────
// Aligned with Chess.com classification:
//   0–5    Brilliant / Great
//   6–30   Good
//   31–90  Inaccuracy
//   91–200 Mistake
//   200+   Blunder

function qualityFromCpLoss(cpLoss: number, totalHalfMoves: number): MoveQuality {
  if (totalHalfMoves <= 6 && cpLoss < 30) return 'book';
  if (cpLoss <= 5)   return Math.random() < 0.12 ? 'brilliant' : 'great';
  if (cpLoss <= 30)  return 'good';
  if (cpLoss <= 90)  return 'inaccuracy';
  if (cpLoss <= 200) return 'mistake';
  return 'blunder';
}

const QUALITY_SYMBOLS: Record<MoveQuality, string> = {
  brilliant:  '!!',
  great:      '!',
  good:       '',
  book:       '',
  inaccuracy: '?!',
  mistake:    '?',
  blunder:    '??',
};

// ── Commentary pools ──────────────────────────────────────────────────────────

type LevelStyle = 'novice' | 'club' | 'strong';

function styleFor(level: CoachLevel): LevelStyle {
  if (level === 'beginner' || level === 'intermediate') return 'novice';
  if (level === 'intermediate2' || level === 'advanced') return 'club';
  return 'strong';
}

const COMMENTS: Record<MoveQuality, Record<LevelStyle, string[]>> = {
  brilliant: {
    novice: ['Amazing! That was the best move. Great job!', 'Wow, excellent choice!'],
    club:   ["Brilliant move! You found the engine's top choice.", "Excellent — that's exactly the right idea."],
    strong: ['!! Outstanding — the engine fully agrees.', 'A truly excellent move. Well calculated.'],
  },
  great: {
    novice: ["Nice move! You're playing well.", 'Great choice! Keep it up!'],
    club:   ['Well played! A strong and accurate move.', 'Good move — your position is improving.'],
    strong: ['! Very good. Your piece placement is precise.', "Excellent move — you're creating real threats."],
  },
  good: {
    novice: ['Good move! Solid play.', 'Nice! Keep developing your pieces.'],
    club:   ["Solid move. You're maintaining the position well.", 'Good play — nothing wrong here.'],
    strong: ['Reasonable. Not the very best, but perfectly fine.', 'Decent choice. The position is roughly balanced.'],
  },
  book: {
    novice: ["Good start! That's a standard opening move.", 'Nice! Following opening principles.'],
    club:   ["A book move — you're in well-charted territory.", 'Standard opening theory. Well done.'],
    strong: ['Book. Stay sharp as we leave theory soon.', 'Theoretical opening move. Good start.'],
  },
  inaccuracy: {
    novice: ['Hmm, not quite the best move. Think about what your opponent can threaten next.', 'A small slip — try to improve your piece coordination.'],
    club:   ['A slight inaccuracy — you had a better option available.', '?! That gives your opponent a small edge.'],
    strong: ['Inaccuracy (?!). You could have played more precisely here.', 'That falls short of the best. Look for more forcing ideas.'],
  },
  mistake: {
    novice: ['Oops! That move gives your opponent an advantage. Watch out for tactics!', 'A mistake — your opponent can now improve their position significantly.'],
    club:   ['A mistake (?). Your opponent now has a real advantage.', "Not great — always check your opponent's responses first."],
    strong: ['Mistake (?). A significant error — the position now favors your opponent.', 'That concedes too much. Think carefully before trading pieces.'],
  },
  blunder: {
    novice: ['Oops, that was a blunder! Always check for forks, pins, and captures before moving.', 'Big mistake! Look for hanging pieces and tactical shots on every move.'],
    club:   ['Blunder (??)! That loses significant material or allows a decisive attack.', 'A serious blunder. Double-check every move for hanging pieces.'],
    strong: ['Blunder (??)! A decisive error. Review your calculation technique.', 'Critical blunder — this may decide the game. Stay focused.'],
  },
};

const TIPS: string[] = [
  'Control the center — pieces in the center dominate the board.',
  'Develop your pieces before launching an attack.',
  'Castle early to keep your king safe.',
  'After castling, connect your rooks on open files.',
  'Knights on the rim are dim — keep them near the center.',
  'Passed pawns must be pushed!',
  'Trade pieces when you have a material advantage.',
  'When ahead, simplify; when behind, complicate.',
  'Look for forcing moves: checks, captures, and threats.',
  'Rooks belong on open files or behind passed pawns.',
  'Do not move the same piece twice in the opening without good reason.',
  'Do not bring your queen out too early — it may be harassed.',
];

function pickText(quality: MoveQuality, style: LevelStyle): string {
  const pool = COMMENTS[quality][style];
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickTip(): string {
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Generate a coaching comment from real Stockfish analysis data.
 *
 * @param playerUciMove   The move the player played in UCI format (e.g. 'e2e4')
 * @param preAnalysis     Multi-PV analysis result taken BEFORE the player's move
 * @param postMoveScore   Stockfish eval AFTER the player's move (white's perspective, cp)
 * @param totalHalfMoves  Half-moves played so far (detects opening book moves)
 * @param playerColor     Which side the player controls
 * @param level           Coach level (controls commentary style)
 */
export function generatePlayerMoveComment(
  playerUciMove: string,
  preAnalysis: AnalysisResult,
  postMoveScore: number,
  totalHalfMoves: number,
  playerColor: 'white' | 'black',
  level: CoachLevel,
): MoveComment {
  const style = styleFor(level);
  const bestPV = preAnalysis.pvs[0];

  // Stockfish UCI `info score cp` is ALWAYS from the SIDE-TO-MOVE's perspective.
  //
  // preAnalysis  → player is to move  → score is from PLAYER's perspective  ✓
  // postAnalysis → opponent is to move → score is from OPPONENT's perspective
  //
  // To compare apples-to-apples, negate postMoveScore to flip it to the
  // player's perspective. playerColor is not needed for this arithmetic.
  const bestForPlayer   = bestPV?.score ?? 0;  // already player-perspective
  const actualForPlayer = -postMoveScore;       // opponent-perspective → player-perspective

  const cpLoss = Math.max(0, bestForPlayer - actualForPlayer);

  const quality = qualityFromCpLoss(cpLoss, totalHalfMoves);
  const symbol  = QUALITY_SYMBOLS[quality];
  const text    = pickText(quality, style);

  // Best alternative = engine's top recommended move
  const bestAlternativeUci = bestPV?.moves[0];
  const bestAlternative =
    bestAlternativeUci &&
    bestAlternativeUci !== playerUciMove &&
    (quality === 'inaccuracy' || quality === 'mistake' || quality === 'blunder')
      ? bestAlternativeUci
      : undefined;

  const tip =
    quality === 'inaccuracy' || quality === 'mistake' || quality === 'blunder'
      ? pickTip()
      : Math.random() < 0.18
      ? pickTip()
      : undefined;

  return { quality, symbol, text, tip, bestAlternative, cpLoss };
}
