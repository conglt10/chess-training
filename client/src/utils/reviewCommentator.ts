/**
 * reviewCommentator.ts
 *
 * Builds the coach's per-move commentary for the Game Review. Comments are
 * generated from Stockfish data plus light positional context (captures,
 * checks, eval swing, the engine's preferred move, opening name) — no LLM.
 */

import type { Classification } from './moveClassifier';

export interface ReviewCommentInput {
  classification: Classification;
  /** SAN of the move played (e.g. "Nf3") */
  san: string;
  /** SAN of the engine's best move, for suggestions */
  bestSan: string | null;
  /** Centipawns lost vs best (mover perspective) */
  cpLoss: number;
  /** Eval after the move, from the MOVER's perspective (cp; +good for mover) */
  evalForMover: number;
  mateForMover: number | null;
  isCapture: boolean;
  givesCheck: boolean;
  /** Opening name, when the move is still book */
  openingName?: string | null;
}

export interface ReviewComment {
  headline: string;
  detail: string;
  /** Best move to suggest (SAN) — shown as "Better was …" */
  suggestion?: string;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

/** Human-readable advantage phrase from the mover's point of view. */
function advantagePhrase(evalForMover: number, mate: number | null): string {
  if (mate !== null) {
    return mate > 0 ? `you have a forced mate in ${mate}` : `you are getting mated in ${Math.abs(mate)}`;
  }
  const p = evalForMover / 100;
  if (p >= 5) return 'you are completely winning';
  if (p >= 2) return 'you have a winning advantage';
  if (p >= 0.8) return 'you are clearly better';
  if (p >= 0.3) return 'you are slightly better';
  if (p > -0.3) return 'the position is balanced';
  if (p > -0.8) return 'you are slightly worse';
  if (p > -2) return 'you are clearly worse';
  if (p > -5) return 'you have a losing position';
  return 'you are completely lost';
}

function lossPawns(cpLoss: number): string {
  return (cpLoss / 100).toFixed(1);
}

const HEADLINES: Record<Classification, string[]> = {
  brilliant:  ['Brilliant!!', 'A stunning move!'],
  great:      ['Great move!', 'Excellent find!'],
  best:       ['Best move!', 'Spot on — the top choice.'],
  excellent:  ['Excellent.', 'Very accurate.'],
  good:       ['Good move.', 'Solid.'],
  book:       ['Book move.', 'Theory.'],
  inaccuracy: ['Inaccuracy.', 'A small slip.'],
  mistake:    ['Mistake.', 'That lets the advantage slip.'],
  miss:       ['Missed chance!', 'You missed a stronger continuation.'],
  blunder:    ['Blunder!', 'A serious error.'],
  forced:     ['Forced.', 'Only move.'],
};

export function generateReviewComment(input: ReviewCommentInput): ReviewComment {
  const {
    classification, san, bestSan, cpLoss, evalForMover, mateForMover,
    isCapture, givesCheck, openingName,
  } = input;

  const seed = san.length + cpLoss;
  const headline = pick(HEADLINES[classification], seed);
  const adv = advantagePhrase(evalForMover, mateForMover);
  const captureBit = isCapture ? ' winning material' : '';
  const checkBit = givesCheck ? ' with check' : '';

  switch (classification) {
    case 'brilliant':
      return {
        headline,
        detail: `A brilliant sacrifice${checkBit}! You gave up material, but the engine confirms ${san} is the strongest move — now ${adv}.`,
      };
    case 'great':
      return {
        headline,
        detail: `This was the only move that kept things going your way${checkBit}. Precise calculation — ${adv}.`,
      };
    case 'best':
      return {
        headline,
        detail: `${san} is exactly what the engine recommends${captureBit}${checkBit}. ${capitalize(adv)}.`,
      };
    case 'excellent':
      return {
        headline,
        detail: `A strong, accurate move${captureBit}${checkBit}. ${capitalize(adv)}.`,
      };
    case 'good':
      return {
        headline,
        detail: `A reasonable move${checkBit}. Not the engine's top pick, but it keeps the position healthy — ${adv}.`,
        suggestion: bestSan ?? undefined,
      };
    case 'book':
      return {
        headline,
        detail: openingName
          ? `A well-known theoretical move from the ${openingName}. You're following established opening principles.`
          : `A standard opening move — you're in well-charted territory.`,
      };
    case 'forced':
      return {
        headline,
        detail: `There was only one legal move here, so ${san} was forced.`,
      };
    case 'inaccuracy':
      return {
        headline,
        detail: `${san} isn't quite best — it costs about ${lossPawns(cpLoss)} pawns of value. Now ${adv}.`,
        suggestion: bestSan ?? undefined,
      };
    case 'mistake':
      return {
        headline,
        detail: `${san} hands over roughly ${lossPawns(cpLoss)} pawns. Always check your opponent's replies first. Now ${adv}.`,
        suggestion: bestSan ?? undefined,
      };
    case 'miss':
      return {
        headline,
        detail: `You had a much stronger continuation available and missed it, losing about ${lossPawns(cpLoss)} pawns of advantage. Now ${adv}.`,
        suggestion: bestSan ?? undefined,
      };
    case 'blunder':
      return {
        headline,
        detail: `${san} loses about ${lossPawns(cpLoss)} pawns of value — look for checks, captures and hanging pieces before every move. Now ${adv}.`,
        suggestion: bestSan ?? undefined,
      };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── General tips, surfaced occasionally for weaker moves ───────────────────────

export const COACH_TIPS: string[] = [
  'Control the center — central pieces dominate the board.',
  'Develop every piece before launching an attack.',
  'Castle early to keep your king safe.',
  'Look for forcing moves first: checks, captures, and threats.',
  'Rooks belong on open files or behind passed pawns.',
  'When ahead in material, trade pieces and simplify.',
  'Before moving, ask what your opponent threatens.',
  'Knights on the rim are dim — keep them centralized.',
];

export function tipFor(classification: Classification, seed: number): string | undefined {
  if (classification === 'inaccuracy' || classification === 'mistake' ||
      classification === 'miss' || classification === 'blunder') {
    return COACH_TIPS[seed % COACH_TIPS.length];
  }
  return undefined;
}
