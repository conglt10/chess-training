/**
 * tcn.ts
 *
 * Decoder for Chess.com's "TCN" move encoding.
 *
 * Chess.com's internal/callback API returns a game's moves as a compact string
 * (the `moveList` field) where every move is encoded in exactly two characters.
 * This is NOT a documented format, but the decoding scheme below is stable and
 * widely used. Each pair of characters maps to a from-square, a to-square, and
 * an optional promotion piece.
 *
 * Reference alphabet (index = 0..) used by Chess.com:
 */

const TCN_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$%*+=:.-/&';

export interface TcnMove {
  from: string;        // e.g. "e2"
  to: string;          // e.g. "e4"
  promotion?: string;  // "q" | "r" | "b" | "n"
}

/**
 * Decode a TCN move string into an ordered list of {from,to,promotion} moves.
 * Squares are returned in standard algebraic form ("e2", "e4", ...).
 */
export function decodeTcn(tcn: string): TcnMove[] {
  const moves: TcnMove[] = [];

  for (let i = 0; i < tcn.length; i += 2) {
    let p1 = TCN_CHARS.indexOf(tcn[i]);
    let p2 = TCN_CHARS.indexOf(tcn[i + 1]);
    if (p1 < 0 || p2 < 0) break; // malformed — stop gracefully

    let promotion: string | undefined;

    if (p2 > 63) {
      // Promotion encoded in the second character.
      promotion = 'qnrbkp'[Math.floor((p2 - 64) / 3)];
      p2 = p1 + (p1 < 16 ? -8 : 8) + ((p2 - 64) % 3) - 1;
    }

    // p1 > 75 would indicate a "drop" (variants like Crazyhouse) — not used in
    // standard games, so we skip those.
    if (p1 > 75) continue;

    const from = TCN_CHARS[p1 % 8] + (Math.floor(p1 / 8) + 1);
    const to = TCN_CHARS[p2 % 8] + (Math.floor(p2 / 8) + 1);

    moves.push(promotion ? { from, to, promotion } : { from, to });
  }

  return moves;
}
