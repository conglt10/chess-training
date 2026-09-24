/**
 * reviewCommentator.ts
 *
 * Builds the coach's per-move commentary for the Game Review. Comments are
 * generated from Stockfish data plus the situation recognizer's tactical
 * report (flaw / missedChance / betterLine / tags) and light positional
 * context (captures, checks, eval swing, the engine's preferred move, opening
 * name) — no LLM.
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
  /** Tactical report from the situation recognizer (optional) */
  flaw?: string | null;
  missedChance?: string | null;
  betterLine?: string | null;
  tags?: string[];
}

export interface ReviewComment {
  headline: string;
  detail: string;
  /** Best move to suggest (SAN) — shown as "Better was …" */
  suggestion?: string;
  /** Concrete refutation-aware line note, e.g. "Bc4 was much better because…" */
  betterLine?: string;
  /** Tactical/positional tags (e.g. "Hanging Piece", "Pin") */
  tags?: string[];
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
  book:       ['Book move.', 'Theory.'],
  inaccuracy: ['Inaccuracy.', 'A small slip.'],
  mistake:    ['Mistake.', 'That lets the advantage slip.'],
  blunder:    ['Blunder!', 'A serious error.'],
};

export function generateReviewComment(input: ReviewCommentInput): ReviewComment {
  const {
    classification, san, bestSan, cpLoss, evalForMover, mateForMover,
    isCapture, givesCheck, openingName,
  } = input;
  const tags = input.tags && input.tags.length > 0 ? [...new Set(input.tags)] : undefined;

  const seed = san.length + cpLoss;
  const headline = pick(HEADLINES[classification], seed);
  const adv = advantagePhrase(evalForMover, mateForMover);
  const captureBit = isCapture ? ' winning material' : '';
  const checkBit = givesCheck ? ' with check' : '';
  const betterLine = input.betterLine ?? undefined;
  const withTags = (c: { headline: string; detail: string; suggestion?: string }): ReviewComment => ({
    ...c,
    ...(betterLine ? { betterLine } : {}),
    ...(tags ? { tags } : {}),
  });

  switch (classification) {
    case 'brilliant':
      return withTags({
        headline,
        detail: `A brilliant sacrifice${checkBit}! You gave up material, but the engine confirms ${san} is the strongest move — now ${adv}.`,
      });
    case 'great':
      return withTags({
        headline,
        detail: `This was the only move that kept things going your way${checkBit}. Precise calculation — ${adv}.`,
      });
    case 'best':
      return withTags({
        headline,
        detail: `${san} is exactly what the engine recommends${captureBit}${checkBit}. ${capitalize(adv)}.`,
      });
    case 'book':
      return withTags({
        headline,
        detail: openingName
          ? `A well-known theoretical move from the ${openingName}. You're following established opening principles.`
          : `A standard opening move — you're in well-charted territory.`,
      });
    case 'inaccuracy':
      return withTags({
        headline,
        detail: input.flaw
          ? `${san} ${input.flaw} — it costs about ${lossPawns(cpLoss)} pawns of value. Now ${adv}.`
          : `${san} isn't quite best — it costs about ${lossPawns(cpLoss)} pawns of value. Now ${adv}.`,
        suggestion: bestSan ?? undefined,
      });
    case 'mistake':
      return withTags({
        headline,
        detail: input.flaw
          ? `${san} ${input.flaw}, handing over roughly ${lossPawns(cpLoss)} pawns. Always check your opponent's replies first. Now ${adv}.`
          : `${san} hands over roughly ${lossPawns(cpLoss)} pawns. Always check your opponent's replies first. Now ${adv}.`,
        suggestion: bestSan ?? undefined,
      });
    case 'blunder': {
      const bits = [input.flaw, input.missedChance].filter(Boolean) as string[];
      return withTags({
        headline,
        detail: bits.length > 0
          ? `${san} ${bits.join(' — ')} (about ${lossPawns(cpLoss)} pawns). Now ${adv}.`
          : `${san} loses about ${lossPawns(cpLoss)} pawns of value — look for checks, captures and hanging pieces before every move. Now ${adv}.`,
        suggestion: bestSan ?? undefined,
      });
    }
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
      classification === 'blunder') {
    return COACH_TIPS[seed % COACH_TIPS.length];
  }
  return undefined;
}
