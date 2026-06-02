import type { PieceTheme } from '../types';

export const DEFAULT_PIECE_THEME: PieceTheme = 'neo';

const PIECE_CODES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as const;
export type PieceCode = (typeof PIECE_CODES)[number];

/** Bundled PNGs under src/assets/pieces/<theme>/<piece>.png */
const pieceModules = import.meta.glob<{ default: string }>('../assets/pieces/*/*.png', {
  eager: true,
});

const PIECES_BY_THEME: Partial<Record<PieceTheme, Partial<Record<PieceCode, string>>>> = {};

for (const path of Object.keys(pieceModules)) {
  const match = path.match(/\/pieces\/([^/]+)\/([wb][KQRBNP])\.png$/);
  if (!match) continue;
  const theme = match[1] as PieceTheme;
  const piece = match[2] as PieceCode;
  if (!PIECES_BY_THEME[theme]) PIECES_BY_THEME[theme] = {};
  PIECES_BY_THEME[theme]![piece] = pieceModules[path].default;
}

export function getPieceImageUrl(theme: PieceTheme, piece: PieceCode): string {
  const url = PIECES_BY_THEME[theme]?.[piece];
  if (url) return url;
  return PIECES_BY_THEME[DEFAULT_PIECE_THEME]?.[piece] ?? '';
}

export { PIECE_CODES };
