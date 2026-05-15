import { useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Square, Piece } from 'react-chessboard/dist/chessboard/types';
import './ChessBoard.css';
import { ThemeConfig, BoardTheme } from '../../types';

interface ChessBoardProps {
  fen: string;
  theme: ThemeConfig;
  interactive?: boolean;
  playerColor?: 'white' | 'black';
  onMove?: (from: string, to: string, promotion?: string) => boolean;
  boardWidth?: number;
}

const BOARD_COLORS: Record<BoardTheme, { light: string; dark: string; highlight: string }> = {
  brown:  { light: '#f0d9b5', dark: '#b58863', highlight: 'rgba(255,255,0,0.4)' },
  blue:   { light: '#dee3e6', dark: '#8ca2ad', highlight: 'rgba(255,255,0,0.4)' },
  green:  { light: '#ffffdd', dark: '#86a666', highlight: 'rgba(255,255,0,0.4)' },
  purple: { light: '#e8d5f5', dark: '#7c4d99', highlight: 'rgba(255,255,0,0.4)' },
  dark:   { light: '#4a4a6a', dark: '#1e1e3a', highlight: 'rgba(108,138,255,0.5)' },
  ice:    { light: '#dce9f5', dark: '#5b85a4', highlight: 'rgba(255,255,0,0.4)' },
};

function makePieceRenderer(pieceTheme: string) {
  const pieces = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
  
  return Object.fromEntries(
    pieces.map((piece) => {
      let themeDir = 'wikipedia';
      if (pieceTheme === 'alpha') themeDir = 'alpha';
      
      return [
        piece,
        ({ squareWidth }: { squareWidth: number }) => (
          <div
            style={{
              width: squareWidth,
              height: squareWidth,
              backgroundImage: `url(https://chessboardjs.com/img/chesspieces/${themeDir}/${piece}.png)`,
              backgroundSize: '100%',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
            }}
          />
        ),
      ];
    })
  ) as Record<string, React.FC<{ squareWidth: number }>>;
}

export default function ChessBoard({
  fen,
  theme,
  interactive = true,
  playerColor = 'white',
  onMove,
  boardWidth = 480,
}: ChessBoardProps) {
  const colors = BOARD_COLORS[theme.board];
  const customPieces = makePieceRenderer(theme.pieces);

  const onPieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square, piece: Piece): boolean => {
      if (!interactive || !onMove) return false;
      const promotion = piece[1]?.toLowerCase() === 'p' &&
        ((playerColor === 'white' && targetSquare[1] === '8') ||
         (playerColor === 'black' && targetSquare[1] === '1'))
        ? 'q' : undefined;
      return onMove(sourceSquare, targetSquare, promotion);
    },
    [interactive, onMove, playerColor]
  );

  return (
    <div
      className="chessboard-root"
      data-piece-theme={theme.pieces}
      style={{ width: boardWidth, height: boardWidth }}
    >
      <Chessboard
        id="main-board"
        position={fen}
        boardWidth={boardWidth}
        boardOrientation={playerColor}
        arePiecesDraggable={interactive}
        onPieceDrop={onPieceDrop}
        customDarkSquareStyle={{ backgroundColor: colors.dark }}
        customLightSquareStyle={{ backgroundColor: colors.light }}
        customPieces={customPieces}
        animationDuration={200}
      />
    </div>
  );
}
