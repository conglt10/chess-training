import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import type { CoachLevel } from '../utils/chessAI';
import { COACH_LEVELS } from '../utils/chessAI';
import { getStockfishService } from '../utils/stockfishService';
import type { AnalysisResult } from '../utils/stockfishService';
import { generatePlayerMoveComment } from '../utils/moveCommentator';
import type { MoveComment } from '../utils/moveCommentator';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CoachMoveEntry {
  halfMoveIndex: number;
  san: string;
  color: 'w' | 'b';
  /** Only set for player moves */
  comment: MoveComment | null;
}

export type GameStatus = 'playing' | 'checkmate' | 'draw' | 'resigned';

// ── Sounds ─────────────────────────────────────────────────────────────────────

const moveAudio    = new Audio('https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3');
const captureAudio = new Audio('https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Capture.mp3');

function playMoveSound(isCapture: boolean) {
  const audio = isCapture ? captureAudio : moveAudio;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// ── Hook ───────────────────────────────────────────────────────────────────────

interface UseCoachGameProps {
  level: CoachLevel;
  playerColor: 'white' | 'black';
}

export interface UseCoachGameReturn {
  fen: string;
  turn: 'w' | 'b';
  moveHistory: CoachMoveEntry[];
  gameStatus: GameStatus;
  winner: 'white' | 'black' | 'draw' | null;
  isCoachThinking: boolean;
  engineReady: boolean;
  fenHistory: string[];
  makePlayerMove: (from: string, to: string, promotion?: string) => boolean;
  resign: () => void;
  reset: () => void;
}

export function useCoachGame({ level, playerColor }: UseCoachGameProps): UseCoachGameReturn {
  const coachColor: 'w' | 'b' = playerColor === 'white' ? 'b' : 'w';
  const chessRef = useRef<Chess>(new Chess());
  const halfMoveRef = useRef(0);

  const [fen, setFen] = useState(() => chessRef.current.fen());
  const [turn, setTurn] = useState<'w' | 'b'>(() => chessRef.current.turn());
  const [moveHistory, setMoveHistory] = useState<CoachMoveEntry[]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  const [winner, setWinner] = useState<'white' | 'black' | 'draw' | null>(null);
  const [isCoachThinking, setIsCoachThinking] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [fenHistory, setFenHistory] = useState<string[]>(() => [chessRef.current.fen()]);

  // Pre-move analysis result (populated as soon as it becomes the player's turn)
  const preAnalysisRef = useRef<AnalysisResult | null>(null);
  const preAnalysisForFenRef = useRef<string>('');
  // Cancel function for the currently running pre-analysis (if any)
  const preAnalysisCancelRef = useRef<(() => void) | null>(null);

  // Guard: true while makePlayerMove's async chain (post-analysis + coach move)
  // is running. Prevents the coach-move effect from firing a duplicate request.
  const playerMoveInProgressRef = useRef(false);

  // ── Engine readiness ─────────────────────────────────────────────────────
  // The WebSocket needs a handshake before the first request can be sent.

  useEffect(() => {
    const svc = getStockfishService();
    if (svc.isReady) {
      setEngineReady(true);
    } else {
      svc.waitReady().then(() => setEngineReady(true));
    }
  }, []);

  // ── Helper: sync React state from chess.js ref ─────────────────────────────

  const syncState = useCallback(() => {
    setFen(chessRef.current.fen());
    setTurn(chessRef.current.turn());
  }, []);

  const resolveGameOver = useCallback((): boolean => {
    const chess = chessRef.current;
    if (chess.isCheckmate()) {
      setGameStatus('checkmate');
      setWinner(chess.turn() === 'w' ? 'black' : 'white');
      return true;
    }
    if (chess.isDraw()) {
      setGameStatus('draw');
      setWinner('draw');
      return true;
    }
    return false;
  }, []);

  // ── Pre-analyze in background when it becomes the player's turn ───────────
  // This ensures commentary is instant after the player clicks.

  useEffect(() => {
    if (!engineReady) return;
    if (gameStatus !== 'playing') return;
    if (turn === coachColor) return; // not player's turn

    const currentFen = chessRef.current.fen();
    if (preAnalysisForFenRef.current === currentFen) return; // already running/done

    preAnalysisForFenRef.current = currentFen;
    preAnalysisRef.current = null;

    // Cancel any previous background pre-analysis
    preAnalysisCancelRef.current?.();

    const { promise, cancel } = getStockfishService()
      .analyze(currentFen, { skillLevel: 20, depth: 15, movetime: 2000, multiPV: 3 });
    preAnalysisCancelRef.current = cancel;

    promise
      .then(result => {
        // Only store if the position hasn't changed
        if (preAnalysisForFenRef.current === currentFen) {
          preAnalysisRef.current = result;
          preAnalysisCancelRef.current = null;
        }
      })
      .catch(() => {/* cancelled or superseded */});
  }, [turn, gameStatus, coachColor, engineReady]);

  // ── Coach move (reusable, called after commentary or at game start) ────────

  const fireCoachMove = useCallback((fen: string) => {
    setIsCoachThinking(true);
    const cfg = COACH_LEVELS[level];

    getStockfishService()
      .analyze(fen, {
        skillLevel: cfg.skillLevel,
        depth: cfg.depth,
        movetime: cfg.movetime,
        multiPV: 1,
      })
      .promise
      .then(result => {
        const chess = chessRef.current;
        const bestUci = result.bestMove;
        if (!bestUci || bestUci === '(none)') {
          setIsCoachThinking(false);
          return;
        }

        const from = bestUci.slice(0, 2);
        const to   = bestUci.slice(2, 4);
        const promo = bestUci.length === 5 ? bestUci[4] : undefined;

        let moveResult;
        try {
          moveResult = chess.move({ from, to, promotion: promo });
        } catch {
          setIsCoachThinking(false);
          return;
        }
        if (!moveResult) {
          setIsCoachThinking(false);
          return;
        }

        playMoveSound(!!moveResult.captured);
        halfMoveRef.current += 1;

        setMoveHistory(prev => [...prev, {
          halfMoveIndex: halfMoveRef.current - 1,
          san: moveResult!.san,
          color: moveResult!.color,
          comment: null,
        }]);

        syncState();
        setFenHistory(prev => [...prev, chessRef.current.fen()]);
        setIsCoachThinking(false);
        resolveGameOver();
      })
      .catch(() => setIsCoachThinking(false));
  }, [level, syncState, resolveGameOver]);

  // ── Player move ────────────────────────────────────────────────────────────

  const makePlayerMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    const chess = chessRef.current;
    if (gameStatus !== 'playing') return false;
    if (chess.turn() === coachColor) return false;

    // Snapshot FEN before move (for post-move eval later)
    const fenBefore = chess.fen();
    const halfMovesBefore = halfMoveRef.current;

    // Validate and apply the move
    let result;
    try {
      result = chess.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return false;
    }
    if (!result) return false;

    playMoveSound(!!result.captured);
    halfMoveRef.current += 1;

    const fenAfter = chess.fen();
    const playerUciMove = `${from}${to}${promotion || ''}`;

    // Capture the pre-analysis snapshot (may be null if not done yet)
    const preAnalysis = preAnalysisRef.current;
    const preAnalysisFen = preAnalysisForFenRef.current;

    // Sync board first so the player sees their move immediately.
    // Set the in-progress guard BEFORE syncState so the coach-move effect
    // (which fires after the re-render) sees it and skips.
    playerMoveInProgressRef.current = true;
    syncState();
    setFenHistory(prev => [...prev, fenAfter]);
    if (resolveGameOver()) {
      playerMoveInProgressRef.current = false;
      return true;
    }

    // Generate commentary asynchronously (uses pre-analysis if available)
    const halfMoveIndex = halfMovesBefore;

    // Add move to history immediately without comment, then update with comment
    setMoveHistory(prev => [...prev, {
      halfMoveIndex,
      san: result!.san,
      color: result!.color,
      comment: null,
    }]);

    const applyComment = (analysis: AnalysisResult, postScore: number) => {
      const comment = generatePlayerMoveComment(
        playerUciMove,
        analysis,
        postScore,
        halfMovesBefore + 1,
        playerColor,
        level,
      );
      setMoveHistory(prev =>
        prev.map(entry =>
          entry.halfMoveIndex === halfMoveIndex
            ? { ...entry, comment }
            : entry
        )
      );
    };

    // Async chain: post-analysis → comment → coach move (sequenced, no race).
    getStockfishService()
      .analyze(fenAfter, { skillLevel: 20, depth: 12, movetime: 1500, multiPV: 1 })
      .promise
      .then(postAnalysis => {
        const postScore = postAnalysis.pvs[0]?.score ?? 0;
        if (preAnalysis && preAnalysisFen === fenBefore) {
          applyComment(preAnalysis, postScore);
          return;
        }
        // Fallback: fresh pre-analysis (only if background didn't finish in time)
        return getStockfishService()
          .analyze(fenBefore, { skillLevel: 20, depth: 12, movetime: 1500, multiPV: 3 })
          .promise
          .then(freshPre => applyComment(freshPre, postScore))
          .catch(() => {});
      })
      .catch(() => {})
      .finally(() => {
        // Commentary done (or failed). Now fire the coach's reply — only AFTER
        // commentary so the engine isn't cancelled mid-analysis.
        playerMoveInProgressRef.current = false;
        const chess2 = chessRef.current;
        if (!chess2.isGameOver() && chess2.turn() === coachColor) {
          fireCoachMove(chess2.fen());
        }
      });

    return true;
  }, [gameStatus, coachColor, playerColor, level, syncState, resolveGameOver, fireCoachMove]);

  // ── Coach AI move ──────────────────────────────────────────────────────────
  // Only fires for the very first coach move (game start when player is black).
  // Subsequent coach moves are triggered directly from makePlayerMove above.

  useEffect(() => {
    if (!engineReady) return;
    if (gameStatus !== 'playing') return;
    if (turn !== coachColor) return;
    if (playerMoveInProgressRef.current) return; // makePlayerMove handles it

    fireCoachMove(chessRef.current.fen());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, gameStatus, engineReady]);

  // ── Resign / Reset ─────────────────────────────────────────────────────────

  const resign = useCallback(() => {
    setGameStatus('resigned');
    setWinner(playerColor === 'white' ? 'black' : 'white');
  }, [playerColor]);

  const reset = useCallback(() => {
    chessRef.current = new Chess();
    halfMoveRef.current = 0;
    setFenHistory([chessRef.current.fen()]);
    preAnalysisRef.current = null;
    preAnalysisForFenRef.current = '';
    preAnalysisCancelRef.current?.();
    preAnalysisCancelRef.current = null;
    playerMoveInProgressRef.current = false;
    setFen(chessRef.current.fen());
    setTurn(chessRef.current.turn());
    setMoveHistory([]);
    setGameStatus('playing');
    setWinner(null);
    setIsCoachThinking(false);
  }, []);

  return {
    fen,
    fenHistory,
    turn,
    moveHistory,
    gameStatus,
    winner,
    isCoachThinking,
    engineReady,
    makePlayerMove,
    resign,
    reset,
  };
}
