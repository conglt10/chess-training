import { useState, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { playMoveSound as playSound } from '../utils/sound';

interface UseChessGameProps {
  moves: string[];
  playerColor?: 'white' | 'black';
}

export function useChessGame({ moves, playerColor = 'white' }: UseChessGameProps) {
  const [game, setGame] = useState(() => new Chess());
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [lastWrongMove, setLastWrongMove] = useState<string | null>(null);
  const gameRef = useRef(game);

  const currentFen = game.fen();
  const isPlayerTurn =
    (playerColor === 'white' && game.turn() === 'w') ||
    (playerColor === 'black' && game.turn() === 'b');

  const reset = useCallback(() => {
    const newGame = new Chess();
    gameRef.current = newGame;
    setGame(newGame);
    setCurrentMoveIndex(0);
    setIsComplete(false);
    setLastWrongMove(null);
  }, []);

  // Apply a move from the sequence (used for theory playback and opponent auto-moves)
  const applySequenceMove = useCallback((idx: number, playSoundFlag = true): boolean => {
    if (idx >= moves.length) return false;
    try {
      const newGame = new Chess(gameRef.current.fen());
      const result = newGame.move(moves[idx]);
      if (result) {
        gameRef.current = newGame;
        setGame(new Chess(newGame.fen()));
        setCurrentMoveIndex(idx + 1);
        if (idx + 1 >= moves.length) setIsComplete(true);
        if (playSoundFlag) playSound(!!result.captured);
        return true;
      }
    } catch {
      // invalid
    }
    return false;
  }, [moves]);

  // Try a user move in exercise mode
  const tryUserMove = useCallback((from: string, to: string, promotion?: string): 'correct' | 'wrong' | 'invalid' => {
    if (currentMoveIndex >= moves.length) return 'invalid';

    const expectedSan = moves[currentMoveIndex];
    try {
      const testGame = new Chess(gameRef.current.fen());
      const result = testGame.move({ from, to, promotion: promotion || 'q' });
      if (!result) return 'invalid';

      // Compare SAN notation
      if (result.san === expectedSan) {
        gameRef.current = testGame;
        setGame(new Chess(testGame.fen()));
        const nextIdx = currentMoveIndex + 1;
        setCurrentMoveIndex(nextIdx);
        setLastWrongMove(null);
        if (nextIdx >= moves.length) setIsComplete(true);
        playSound(!!result.captured);
        return 'correct';
      } else {
        setLastWrongMove(result.san);
        return 'wrong';
      }
    } catch {
      return 'invalid';
    }
  }, [currentMoveIndex, moves]);

  // Step back one move (for theory view)
  const stepBack = useCallback(() => {
    if (currentMoveIndex === 0) return;
    // Replay from scratch
    const newGame = new Chess();
    for (let i = 0; i < currentMoveIndex - 1; i++) {
      newGame.move(moves[i]);
    }
    gameRef.current = newGame;
    setGame(new Chess(newGame.fen()));
    setCurrentMoveIndex(currentMoveIndex - 1);
    setIsComplete(false);
    playSound(false);
  }, [currentMoveIndex, moves]);

  const stepForward = useCallback(() => {
    applySequenceMove(currentMoveIndex);
  }, [applySequenceMove, currentMoveIndex]);

  const fastForwardToEnd = useCallback(() => {
    const newGame = new Chess();
    let lastResult = null;
    for (const move of moves) {
      lastResult = newGame.move(move);
    }
    gameRef.current = newGame;
    setGame(new Chess(newGame.fen()));
    setCurrentMoveIndex(moves.length);
    setIsComplete(true);
    playSound(lastResult ? !!lastResult.captured : false);
  }, [moves]);

  return {
    fen: currentFen,
    currentMoveIndex,
    isComplete,
    isPlayerTurn,
    lastWrongMove,
    applySequenceMove,
    tryUserMove,
    reset,
    stepBack,
    stepForward,
    fastForwardToEnd,
  };
}
