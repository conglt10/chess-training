import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { MasterGame } from '../types';
import { playMoveSound as playSound } from '../utils/sound';

interface UseMasterDrillProps {
  game: MasterGame;
  /** Which side's moves the user predicts; the other side auto-plays. */
  trainColor: 'white' | 'black';
  /** Plies to auto-play before drilling begins (the explorer prefix). */
  startPly: number;
}

export interface LastMove {
  from: string;
  to: string;
  uci: string;
  san: string;
  /** FEN of the position before this move (for review-mode analysis) */
  fenBefore: string;
  color: 'w' | 'b';
}

/**
 * "Guess the master's move" drill state. Auto-plays the opening prefix and the
 * opponent's real moves; the user predicts every move of `trainColor`, validated
 * against what the master actually played.
 */
export function useMasterDrill({ game, trainColor, startPly }: UseMasterDrillProps) {
  const totalPlies = game.moves.length;
  const trainChar = trainColor === 'white' ? 'w' : 'b';

  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(() => new Chess().fen());
  const [currentPly, setCurrentPly] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [lastWrong, setLastWrong] = useState<string | null>(null);
  const [revealHint, setRevealHint] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);

  const inPrefix = currentPly < startPly;
  const sideToMove = gameRef.current.turn();
  const isUserTurn =
    !isComplete && !inPrefix && currentPly < totalPlies && sideToMove === trainChar;
  const isAutoTurn = !isComplete && currentPly < totalPlies && !isUserTurn;

  const reset = useCallback(() => {
    const fresh = new Chess();
    gameRef.current = fresh;
    setFen(fresh.fen());
    setCurrentPly(0);
    setIsComplete(false);
    setLastWrong(null);
    setRevealHint(false);
    setCorrectCount(0);
    setAttempts(0);
    setLastMove(null);
  }, []);

  // Re-init whenever the drilled game / parameters change.
  useEffect(() => { reset(); }, [game.id, trainColor, startPly, reset]);

  // Apply the master's actual move at `idx` (used for the prefix + opponent moves
  // + revealing on give-up).
  const applyMasterMove = useCallback((idx: number) => {
    if (idx >= totalPlies) return;
    const fenBefore = gameRef.current.fen();
    const next = new Chess(fenBefore);
    const result = next.move(game.moves[idx]);
    if (!result) return;
    gameRef.current = next;
    setFen(next.fen());
    setLastMove({
      from: result.from, to: result.to,
      uci: result.from + result.to + (result.promotion ?? ''),
      san: result.san, fenBefore, color: result.color,
    });
    setCurrentPly(idx + 1);
    setLastWrong(null);
    setRevealHint(false);
    if (idx + 1 >= totalPlies) setIsComplete(true);
    playSound(!!result.captured);
  }, [game.moves, totalPlies]);

  // Try the user's guess against the master's move.
  const guess = useCallback((from: string, to: string, promotion?: string): 'correct' | 'wrong' | 'invalid' => {
    if (!isUserTurn) return 'invalid';
    const expectedSan = game.moves[currentPly];
    try {
      const test = new Chess(gameRef.current.fen());
      const result = test.move({ from, to, promotion: promotion || 'q' });
      if (!result) return 'invalid';

      if (result.san === expectedSan) {
        const fenBefore = gameRef.current.fen();
        gameRef.current = test;
        setFen(test.fen());
        setLastMove({
          from: result.from, to: result.to,
          uci: result.from + result.to + (result.promotion ?? ''),
          san: result.san, fenBefore, color: result.color,
        });
        setCurrentPly(currentPly + 1);
        setLastWrong(null);
        setRevealHint(false);
        setCorrectCount(c => c + 1);
        setAttempts(a => a + 1);
        if (currentPly + 1 >= totalPlies) setIsComplete(true);
        playSound(!!result.captured);
        return 'correct';
      }
      setLastWrong(result.san);
      setAttempts(a => a + 1);
      return 'wrong';
    } catch {
      return 'invalid';
    }
  }, [isUserTurn, game.moves, currentPly, totalPlies]);

  // Give up on the current move: reveal & play the master's move.
  const revealAndAdvance = useCallback(() => {
    if (!isUserTurn) return;
    applyMasterMove(currentPly);
  }, [isUserTurn, currentPly, applyMasterMove]);

  return {
    fen,
    currentPly,
    startPly,
    totalPlies,
    isComplete,
    isUserTurn,
    isAutoTurn,
    inPrefix,
    lastMove,
    lastWrong,
    revealHint,
    setRevealHint,
    expectedSan: game.moves[currentPly],
    correctCount,
    attempts,
    applyMasterMove,
    guess,
    revealAndAdvance,
    reset,
  };
}
