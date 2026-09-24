/**
 * situationRecognizer.ts
 *
 * Tactical situation recognizer for the frontend-only Game Review
 * (WhyBlunder spec §3: `SituationRecognizer: Geometric Tactical Raycasting`).
 *
 * Rather than showing raw engine output, positions are examined with
 * 64-square raycasting and attack graphs to extract concrete chess concepts:
 *
 * - Tactical forks: piece attacks vs higher-value / undefended targets
 *   (capturable attackers filtered via safety checks)
 * - Pins & skewers: sliding rays (Q/R/B) through a target to a King or
 *   high-value piece behind it
 * - Hanging pieces: unprotected pieces on attacked squares, moved pieces left
 *   en prise, abandoned defenders
 * - Positional patterns: center pawn duos, open-file rooks, 7th-rank
 *   infiltration, outposts, castling forfeits
 *
 * Structured output per analyzed move:
 *   { flaw, missedChance, betterLine, tags }
 */

import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

export interface SituationReport {
  flaw: string | null;
  missedChance: string | null;
  betterLine: string | null;
  tags: string[];
}

export interface SituationInput {
  /** FEN before the played move. */
  fenBefore: string;
  /** FEN after the played move. */
  fenAfter: string;
  /** Played move + engine best move (UCI). */
  playedUci: string;
  bestUci: string | null;
  bestSan: string | null;
  /** Opponent's refutation line after the move (UCI, Phase-2 search). */
  refutationPv: string[];
  /** SAN of the played move. */
  playedSan: string;
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

const PIECE_NAME: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

function sqName(file: number, rank: number): string {
  return `${'abcdefgh'[file]}${rank + 1}`;
}

function parseSq(sq: string): [number, number] {
  return [sq.charCodeAt(0) - 97, parseInt(sq[1], 10) - 1];
}

function onBoard(f: number, r: number): boolean {
  return f >= 0 && f < 8 && r >= 0 && r < 8;
}

/** Piece on `sq` in `chess` (null when empty). */
function pieceAt(chess: Chess, sq: string): { type: string; color: 'w' | 'b' } | null {
  try {
    const p = chess.get(sq as Square);
    return p ? { type: p.type, color: p.color } : null;
  } catch {
    return null;
  }
}

function isAttacked(chess: Chess, sq: string, by: 'w' | 'b'): boolean {
  try {
    return chess.attackers(sq as Square, by).length > 0;
  } catch {
    return false;
  }
}

/** Attacker is "safe" when the destination is not recapturable cheaply. */
function isPieceSafe(chess: Chess, sq: string, mover: 'w' | 'b'): boolean {
  const foe = mover === 'w' ? 'b' : 'w';
  if (!isAttacked(chess, sq, foe)) return true;
  const victim = pieceAt(chess, sq);
  if (!victim) return true;
  // Safe if every recapture costs the opponent at least what they win.
  try {
    const recapturers = chess.attackers(sq as Square, foe);
    for (const from of recapturers) {
      const atk = pieceAt(chess, from);
      if (atk && (VALUE[atk.type] ?? 0) >= (VALUE[victim.type] ?? 0)) return false;
    }
  } catch {
    return false;
  }
  return true;
}

const SLIDERS: Record<string, Array<[number, number]>> = {
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};

/** Trace a sliding ray; returns [firstPieceSq, pieceBehindSq] (either nullable). */
function traceRay(
  chess: Chess,
  fromFile: number,
  fromRank: number,
  df: number,
  dr: number,
): [string | null, string | null] {
  let first: string | null = null;
  let f = fromFile + df;
  let r = fromRank + dr;
  while (onBoard(f, r)) {
    const sq = sqName(f, r);
    if (pieceAt(chess, sq)) {
      if (!first) first = sq;
      else return [first, sq];
    }
    f += df;
    r += dr;
  }
  return [first, null];
}

function describePiece(chess: Chess, sq: string): string {
  const p = pieceAt(chess, sq);
  return p ? `${PIECE_NAME[p.type]} on ${sq}` : sq;
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function recognizeSituation(input: SituationInput): SituationReport {
  const tags: string[] = [];
  let flaw: string | null = null;
  let missedChance: string | null = null;
  let betterLine: string | null = null;

  const { fenBefore, fenAfter, playedUci, bestUci, bestSan, refutationPv, playedSan } = input;

  let before: Chess;
  let after: Chess;
  try {
    before = new Chess(fenBefore);
    after = new Chess(fenAfter);
  } catch {
    return { flaw, missedChance, betterLine, tags };
  }

  const mover: 'w' | 'b' = fenBefore.split(' ')[1] === 'b' ? 'b' : 'w';
  const foe: 'w' | 'b' = mover === 'w' ? 'b' : 'w';
  const to = playedUci.slice(2, 4);

  // Game over (mate/stalemate): no flaws or refutations — the result is final.
  // Positional tags below still apply.
  let gameOver = false;
  try {
    gameOver = after.isCheckmate() || after.isStalemate() || after.isDraw();
  } catch { gameOver = false; }

  // ── 1. Hanging pieces: mover's unprotected piece on an attacked square ──
  try {
    if (!gameOver) {
      const hostile = after.attackers(to as Square, foe);
      if (hostile.length > 0) {
        const moved = pieceAt(after, to);
        if (moved && moved.color === mover && !isPieceSafe(after, to, mover)) {
          const capturer = hostile[0];
          const capPiece = pieceAt(after, capturer);
          flaw = `leaves the ${describePiece(after, to)} hanging` +
            (capPiece ? `, which allows ${capturer}x${to} capturing the exposed piece` : '');
          tags.push('Hanging Piece');
        }
      }
      // Any other newly-undefended mover piece? Scan the board cheaply.
      if (!flaw) {
        for (let f = 0; f < 8 && !flaw; f++) {
          for (let r = 0; r < 8 && !flaw; r++) {
            const sq = sqName(f, r);
            const p = pieceAt(after, sq);
            if (!p || p.color !== mover || p.type === 'p' || p.type === 'k') continue;
            if (isAttacked(after, sq, foe) && !isPieceSafe(after, sq, mover)) {
              const wasThere = pieceAt(before, sq);
              if (!wasThere || wasThere.color !== mover) {
                flaw = `leaves the ${describePiece(after, sq)} undefended under attack`;
                tags.push('Hanging Piece');
              }
            }
          }
        }
      }
    }
  } catch { /* best-effort */ }

  // ── 2. Pins & skewers against the mover (after the move) ────────────────
  try {
    if (!gameOver) {
    outer: for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const sq = sqName(f, r);
        const p = pieceAt(after, sq);
        if (!p || p.color !== foe || !(p.type in SLIDERS)) continue;
        for (const [df, dr] of SLIDERS[p.type]) {
          const [first, behind] = traceRay(after, f, r, df, dr);
          if (!first || !behind) continue;
          const front = pieceAt(after, first);
          const back = pieceAt(after, behind);
          if (!front || front.color !== mover || !back) continue;
          const backVal = VALUE[back.type] ?? 0;
          const frontVal = VALUE[front.type] ?? 0;
          if (back.type === 'k' && frontVal >= 1 && frontVal < 100) {
            if (!flaw) {
              flaw = `${playedSan} walks into a pin: the ${PIECE_NAME[front.type]} on ${first} ` +
                `is pinned to the king by the ${PIECE_NAME[p.type]} on ${sq}`;
            }
            if (!tags.includes('Pin')) tags.push('Pin');
            break outer;
          }
          if (backVal > frontVal && backVal >= 5) {
            if (!flaw) {
              flaw = `${playedSan} allows a skewer: the ${PIECE_NAME[p.type]} on ${sq} ` +
                `x-rays through the ${describePiece(after, first)} to the ${describePiece(after, behind)}`;
            }
            if (!tags.includes('Skewer')) tags.push('Skewer');
            break outer;
          }
        }
      }
    }
    }
  } catch { /* best-effort */ }

  // ── 3. Refutation: what the opponent's reply wins (missedChance) ────────
  try {
    if (!gameOver) {
    if (refutationPv.length > 0 && bestUci && bestUci.toLowerCase() !== playedUci.toLowerCase()) {
      const reply = new Chess(fenAfter);
      const firstReply = refutationPv[0];
      const mv = reply.move({
        from: firstReply.slice(0, 2),
        to: firstReply.slice(2, 4),
        promotion: firstReply.length === 5 ? firstReply[4] : undefined,
      });
      if (mv) {
        if (mv.captured) {
          const val = VALUE[mv.captured] ?? 0;
          if (val >= 3 || mv.san.includes('+')) {
            missedChance = `missed stopping ${mv.san} winning the ${PIECE_NAME[mv.captured]}` +
              (mv.san.includes('+') ? ' with check' : '');
            if (!tags.includes('Tactical Fork') && val >= 5) tags.push('Tactical Fork');
          } else {
            missedChance = `allows ${mv.san} winning material`;
          }
        } else if (mv.san.includes('+')) {
          // Forcing check reply — does it fork?
          const victimHits = countAttacksOnValuables(reply, foe);
          if (victimHits >= 2) {
            missedChance = `allows ${mv.san}, forking ${victimHits} targets with check`;
            tags.push('Tactical Fork');
          } else {
            missedChance = `allows the strong reply ${mv.san}`;
          }
        } else {
          missedChance = `allows the strong reply ${mv.san}`;
        }
      }
      if (bestSan) {
        betterLine = `${bestSan} was much better because it avoids the refutation` +
          (mv ? ` (${mv.san})` : '');
      }
    } else if (bestSan && bestUci && bestUci.toLowerCase() !== playedUci.toLowerCase()) {
      betterLine = `${bestSan} was much better here`;
    }
    }
  } catch { /* best-effort */ }

  // ── 4. Forks BY the played move (tactical upside worth naming) ──────────
  try {
    const hits = attacksOnValuables(after, to, mover);
    if (hits.length >= 2 && isPieceSafe(after, to, mover)) {
      tags.push('Tactical Fork');
      if (!flaw && !missedChance) {
        missedChance = null;
      }
    }
  } catch { /* noop */ }

  // ── 5. Positional patterns ──────────────────────────────────────────────
  try {
    // Center pawn duo.
    const duoSquares = mover === 'w' ? ['d4', 'e4'] : ['d5', 'e5'];
    if (duoSquares.every(sq => {
      const p = pieceAt(after, sq);
      return p && p.color === mover && p.type === 'p';
    })) {
      tags.push('Center Control');
    }
    // Open-file rook.
    const [tf, tr] = parseSq(to);
    void tr;
    const rook = pieceAt(after, to);
    if (rook && rook.color === mover && rook.type === 'r') {
      let blocked = false;
      for (let r = 0; r < 8; r++) {
        const p = pieceAt(after, sqName(tf, r));
        if (p && p.type === 'p') { blocked = true; break; }
      }
      if (!blocked) tags.push('Open File');
    }
    // 7th-rank infiltration.
    if (rook && rook.color === mover && rook.type === 'r') {
      const rank = parseInt(to[1], 10);
      if ((mover === 'w' && rank === 7) || (mover === 'b' && rank === 2)) {
        tags.push('7th Rank');
      }
    }
    // True outpost: knight on 4th–6th rank, pawn-supported, unattackable by pawns.
    const knight = pieceAt(after, to);
    if (knight && knight.color === mover && knight.type === 'n') {
      const rank = parseInt(to[1], 10);
      const central = (mover === 'w' && rank >= 4 && rank <= 6) ||
        (mover === 'b' && rank >= 3 && rank <= 5);
      if (central && isPawnSupported(after, to, mover) && !isPawnAttacked(after, to, foe)) {
        tags.push('Outpost');
      }
    }
    // Castling forfeit: king moved while castling was still available.
    const kingFrom = playedUci.slice(0, 2);
    const kingPiece = pieceAt(before, kingFrom);
    if (kingPiece && kingPiece.type === 'k' && kingPiece.color === mover) {
      const castling = fenBefore.split(' ')[2] ?? '-';
      const hadRights = mover === 'w'
        ? castling.includes('K') || castling.includes('Q')
        : castling.includes('k') || castling.includes('q');
      const castled = playedSan === 'O-O' || playedSan === 'O-O-O';
      if (hadRights && !castled) tags.push('Castling Forfeit');
    }
  } catch { /* best-effort */ }

  return { flaw, missedChance, betterLine, tags: [...new Set(tags)] };
}

/** Squares with mover's high-value/undefended pieces attacked by `by`. */
function countAttacksOnValuables(chess: Chess, by: 'w' | 'b'): number {
  let n = 0;
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const sq = sqName(f, r);
      const p = pieceAt(chess, sq);
      if (!p || p.color === by) continue;
      if ((VALUE[p.type] ?? 0) >= 3 && isAttacked(chess, sq, by)) n++;
    }
  }
  return n;
}

/** Valuable opponent targets attacked FROM `sq` by the mover. */
function attacksOnValuables(chess: Chess, from: string, mover: 'w' | 'b'): string[] {
  const foe = mover === 'w' ? 'b' : 'w';
  const hits: string[] = [];
  try {
    const moves = chess.moves({ square: from as Square, verbose: true });
    for (const m of moves) {
      const target = pieceAt(chess, m.to);
      if (target && target.color === foe && (VALUE[target.type] ?? 0) >= 3) {
        hits.push(m.to);
      }
    }
  } catch { /* noop */ }
  return hits;
}

function isPawnSupported(chess: Chess, sq: string, color: 'w' | 'b'): boolean {
  const [f, r] = parseSq(sq);
  const dir = color === 'w' ? -1 : 1;
  for (const df of [-1, 1]) {
    const pf = f + df;
    const pr = r + dir;
    if (!onBoard(pf, pr)) continue;
    const p = pieceAt(chess, sqName(pf, pr));
    if (p && p.color === color && p.type === 'p') return true;
  }
  return false;
}

function isPawnAttacked(chess: Chess, sq: string, byPawnsOf: 'w' | 'b'): boolean {
  const [f, r] = parseSq(sq);
  // A pawn of color C attacks from one rank behind (from C's perspective).
  const dir = byPawnsOf === 'w' ? -1 : 1;
  for (const df of [-1, 1]) {
    const pf = f + df;
    const pr = r + dir;
    if (!onBoard(pf, pr)) continue;
    const p = pieceAt(chess, sqName(pf, pr));
    if (p && p.color === byPawnsOf && p.type === 'p') return true;
  }
  return false;
}
