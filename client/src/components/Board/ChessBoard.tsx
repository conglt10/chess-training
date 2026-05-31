import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Square, Piece } from 'react-chessboard/dist/chessboard/types';
import { Chess } from 'chess.js';
import './ChessBoard.css';
import { ThemeConfig, BoardTheme } from '../../types';
import { getPieceImageUrl, PIECE_CODES } from '../../pieces/themes';

type ArrowAnnotation = [Square, Square, string];

interface LegalTarget {
  square: Square;
  isCapture: boolean;
}

function annotationColor(e: MouseEvent): string {
  if (e.shiftKey) return 'rgba(255, 80, 80, 0.85)';         // red
  if (e.ctrlKey || e.metaKey) return 'rgba(80, 160, 255, 0.85)'; // blue
  return 'rgba(246, 192, 0, 0.85)';                          // gold (default)
}

interface ChessBoardProps {
  fen: string;
  theme: ThemeConfig;
  interactive?: boolean;
  playerColor?: 'white' | 'black';
  onMove?: (from: string, to: string, promotion?: string) => boolean;
  boardWidth?: number;
}

const BOARD_COLORS: Record<BoardTheme, { light: string; dark: string; highlight: string }> = {
  brown: { light: '#f0d9b5', dark: '#b58863', highlight: 'rgba(255,255,0,0.4)' },
  blue: { light: '#dee3e6', dark: '#8ca2ad', highlight: 'rgba(255,255,0,0.4)' },
  green: { light: '#ffffdd', dark: '#86a666', highlight: 'rgba(255,255,0,0.4)' },
  purple: { light: '#e8d5f5', dark: '#7c4d99', highlight: 'rgba(255,255,0,0.4)' },
  dark: { light: '#4a4a6a', dark: '#1e1e3a', highlight: 'rgba(108,138,255,0.5)' },
  ice:      { light: '#dce9f5', dark: '#5b85a4', highlight: 'rgba(255,255,0,0.4)' },
  walnut:   { light: '#e8c99a', dark: '#8b5a2b', highlight: 'rgba(255,255,0,0.4)' },
  maple:    { light: '#f5d7a3', dark: '#c68642', highlight: 'rgba(255,255,0,0.4)' },
  mahogany: { light: '#e8b89a', dark: '#7b3726', highlight: 'rgba(255,255,0,0.4)' },
};

function makePieceRenderer(pieceTheme: ThemeConfig['pieces']) {
  return Object.fromEntries(
    PIECE_CODES.map((piece) => [
      piece,
      ({ squareWidth }: { squareWidth: number }) => (
        <div
          style={{
            width: squareWidth,
            height: squareWidth,
            backgroundImage: `url(${getPieceImageUrl(pieceTheme, piece)})`,
            backgroundSize: '100%',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
          }}
        />
      ),
    ])
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

  // ── Annotation state (right-click circles + arrows) ──────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const [circles, setCircles] = useState<Map<string, string>>(new Map());
  const [drawnArrows, setDrawnArrows] = useState<ArrowAnnotation[]>([]);
  const arrowStartRef = useRef<string | null>(null);
  const prevFenRef = useRef<string>(fen);

  // ── Selection state (click-to-move + highlights) ───────────────────────────
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<LegalTarget[]>([]);

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setLegalTargets([]);
  }, []);

  // Clear everything when a move is made (fen changes)
  useEffect(() => {
    if (prevFenRef.current !== fen) {
      prevFenRef.current = fen;
      setCircles(new Map());
      setDrawnArrows([]);
      clearSelection();
    }
  }, [fen, clearSelection]);

  // onSquareClick: selection + click-to-move
  const onSquareClick = useCallback((square: Square) => {
    if (!interactive) return;

    // Deselect on second click of same square
    if (selectedSquare === square) {
      clearSelection();
      return;
    }

    // If a piece is selected, try to move to this square
    if (selectedSquare) {
      const isLegal = legalTargets.some(t => t.square === square);
      if (isLegal && onMove) {
        // Detect promotion: pawn reaching the back rank
        const chess = new Chess(fen);
        const movingPiece = chess.get(selectedSquare);
        const promotion =
          movingPiece?.type === 'p' &&
          ((movingPiece.color === 'w' && square[1] === '8') ||
           (movingPiece.color === 'b' && square[1] === '1'))
            ? 'q' : undefined;
        const success = onMove(selectedSquare, square, promotion);
        if (success) { clearSelection(); return; }
      }
    }

    // Try to select a friendly piece on this square
    const chess = new Chess(fen);
    const piece = chess.get(square);
    const playerColorChar = playerColor === 'white' ? 'w' : 'b';

    if (piece && piece.color === playerColorChar && interactive) {
      setSelectedSquare(square);
      const moves = chess.moves({ square, verbose: true });
      setLegalTargets(
        moves.map(m => ({
          square: m.to as Square,
          isCapture: m.captured !== undefined,
        }))
      );
    } else {
      clearSelection();
    }
  }, [interactive, onMove, selectedSquare, legalTargets, fen, playerColor, clearSelection]);

  // DOM events: right-click drag → arrow, right-click → circle, left-click → clear annotations
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const getSquare = (x: number, y: number): string | null =>
      ((document.elementFromPoint(x, y)?.closest('[data-square]')) as HTMLElement | null)
        ?.dataset.square ?? null;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        // Only clear right-click annotations on left click; piece selection
        // is handled by onSquareClick (React synthetic event).
        setCircles(new Map());
        setDrawnArrows([]);
        return;
      }
      if (e.button === 2) {
        arrowStartRef.current = getSquare(e.clientX, e.clientY);
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      const from = arrowStartRef.current;
      arrowStartRef.current = null;
      if (!from) return;

      const to = getSquare(e.clientX, e.clientY);
      if (!to) return;

      const color = annotationColor(e);

      if (from === to) {
        setCircles(prev => {
          const next = new Map(prev);
          if (next.get(to) === color) next.delete(to);
          else next.set(to, color);
          return next;
        });
      } else {
        setDrawnArrows(prev => {
          const exists = prev.some(a => a[0] === from && a[1] === to);
          return exists
            ? prev.filter(a => !(a[0] === from && a[1] === to))
            : [...prev, [from as Square, to as Square, color]];
        });
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    root.addEventListener('mousedown', onMouseDown);
    root.addEventListener('mouseup', onMouseUp);
    root.addEventListener('contextmenu', onContextMenu);
    return () => {
      root.removeEventListener('mousedown', onMouseDown);
      root.removeEventListener('mouseup', onMouseUp);
      root.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  // Combined custom square styles: legal targets → selected square → right-click circles
  // (later entries override earlier ones for the same square)
  const combinedSquareStyles = useMemo((): Record<string, React.CSSProperties> => {
    const styles: Record<string, React.CSSProperties> = {};

    // Legal move dots (empty squares) and capture rings
    for (const { square, isCapture } of legalTargets) {
      styles[square] = isCapture
        ? {
            // Ring around the piece — capture indicator
            backgroundImage: `radial-gradient(circle, transparent 68%, rgba(0,0,0,0.18) 70%)`,
          }
        : {
            // Small dot in the centre — empty-square move indicator
            backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.18) 24%, transparent 25%)`,
          };
    }

    // Selected piece square — theme-aware highlight
    if (selectedSquare) {
      styles[selectedSquare] = { background: colors.highlight };
    }

    // Right-click circles (drawn on top, so they override selection)
    for (const [sq, color] of circles.entries()) {
      styles[sq] = { backgroundImage: `radial-gradient(circle, transparent 52%, ${color} 55%)` };
    }

    return styles;
  }, [legalTargets, selectedSquare, circles, colors.highlight]);

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
    <div className="chessboard-container">
      <div
        ref={rootRef}
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
          areArrowsAllowed={false}
          customArrows={drawnArrows}
          customSquareStyles={combinedSquareStyles}
          onSquareClick={onSquareClick}
        />
      </div>
    </div>
  );
}
