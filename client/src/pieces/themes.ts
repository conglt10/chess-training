import type { PieceTheme } from '../types';

import neoBK from '../assets/pieces/neo/bK.png';
import neoBN from '../assets/pieces/neo/bN.png';
import neoBP from '../assets/pieces/neo/bP.png';
import neoBQ from '../assets/pieces/neo/bQ.png';
import neoBR from '../assets/pieces/neo/bR.png';
import neoBB from '../assets/pieces/neo/bB.png';
import neoWK from '../assets/pieces/neo/wK.png';
import neoWN from '../assets/pieces/neo/wN.png';
import neoWP from '../assets/pieces/neo/wP.png';
import neoWQ from '../assets/pieces/neo/wQ.png';
import neoWR from '../assets/pieces/neo/wR.png';
import neoWB from '../assets/pieces/neo/wB.png';

export const DEFAULT_PIECE_THEME: PieceTheme = 'neo';

const PIECE_CODES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as const;
export type PieceCode = (typeof PIECE_CODES)[number];

const NEO_PIECES: Record<PieceCode, string> = {
  wK: neoWK,
  wQ: neoWQ,
  wR: neoWR,
  wB: neoWB,
  wN: neoWN,
  wP: neoWP,
  bK: neoBK,
  bQ: neoBQ,
  bR: neoBR,
  bB: neoBB,
  bN: neoBN,
  bP: neoBP,
};

const CHESSBOARDJS_THEMES: PieceTheme[] = ['wikipedia', 'alpha', 'uscf', 'classic', 'business', 'chess24'];

export function getPieceImageUrl(theme: PieceTheme, piece: PieceCode): string {
  if (theme === 'neo') {
    return NEO_PIECES[piece];
  }
  if (CHESSBOARDJS_THEMES.includes(theme)) {
    return `https://chessboardjs.com/img/chesspieces/${theme}/${piece}.png`;
  }
  return NEO_PIECES[piece];
}

export { PIECE_CODES };
