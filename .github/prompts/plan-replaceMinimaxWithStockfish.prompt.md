# Plan: Replace Minimax with Stockfish.js Web Worker

## TL;DR
Replace the toy `chessAI.ts` minimax engine with Stockfish.js (WASM, single-threaded) running in a dedicated Web Worker, using UCI + Multi-PV for accurate move quality analysis. No LLM (skipped per user). All UI/routing/CSS stays the same; only the engine pipeline and commentary data pipeline change.

---

## Phase 1 — Stockfish Worker Infrastructure (steps 1–4)

1. **Install packages**: `stockfish` (v16, WASM) + `vite-plugin-wasm` + `vite-plugin-top-level-await`
   - *depends on nothing*

2. **Update `client/vite.config.ts`**:
   - Add `wasm()` and `topLevelAwait()` plugins
   - Add `optimizeDeps.exclude: ['stockfish']` to prevent Vite pre-bundling it
   - *depends on step 1*

3. **Create `client/src/workers/stockfishWorker.ts`** (module Worker):
   - Import and init Stockfish via `import Stockfish from 'stockfish/src/stockfish-nnue-16-single.js'`
   - Handle UCI handshake: `uci → uciok → isready → readyok`
   - `onmessage`: receive `{ type, payload }` commands from main thread
   - Implement UCI command dispatcher: `setOption`, `newGame`, `analyze`, `getBestMove`, `stop`
   - Parse `info` lines (depth, score cp, multipv, pv) and accumulate per MultiPV slot
   - On `bestmove` line: fire completion with accumulated PVs + best move
   - `postMessage` results back
   - *depends on step 2*

4. **Create `client/src/utils/stockfishService.ts`** — singleton Promise-based wrapper:
   - Spawns `stockfishWorker` once via `new Worker(new URL('../workers/stockfishWorker.ts', import.meta.url), { type: 'module' })`
   - `isReady: boolean` (becomes true after `readyok`)
   - `analyze(fen, opts: { depth, multiPV, skillLevel, movetime }): Promise<AnalysisResult>` — correlation ID based
   - `terminate()`: kills worker on cleanup
   - Export `AnalysisResult` type: `{ bestMove: string; pvs: PV[]; }` where `PV = { rank: number; score: number; moves: string[] }`
   - *depends on step 3*

---

## Phase 2 — Engine & Commentary Rewrite (steps 5–6)

5. **Rewrite `client/src/utils/chessAI.ts`** (keep file, replace content):
   - REMOVE: all minimax, alpha-beta, PST tables, evaluateBoard, getBestMove, getBestMoveForCommentary
   - KEEP & UPDATE: `CoachLevel`, `CoachLevelConfig`, `COACH_LEVELS` with Stockfish-specific fields:
     ```
     beginner:      { skillLevel: 1,  depth: 5,  movetime: 300,  ... }
     intermediate:  { skillLevel: 4,  depth: 8,  movetime: 500,  ... }
     intermediate2: { skillLevel: 7,  depth: 10, movetime: 700,  ... }
     advanced:      { skillLevel: 11, depth: 12, movetime: 1000, ... }
     expert:        { skillLevel: 14, depth: 14, movetime: 1500, ... }
     master:        { skillLevel: 17, depth: 15, movetime: 2000, ... }
     grandmaster:   { skillLevel: 20, depth: 16, movetime: 3000, ... }
     ```
   - ADD: `getCoachConfig(level): CoachLevelConfig` helper
   - *parallel with step 4*

6. **Rewrite `client/src/utils/moveCommentator.ts`** (keep file, replace content):
   - New signature: `generatePlayerMoveComment(playerSan, analysisResult, totalHalfMoves, level)`
   - Use `AnalysisResult.pvs[0].score` as bestScore
   - Find player's move in top-3 PVs to get its exact score; if not in top-3, use post-move eval from a second `analyze()` call (depth 1, quick)
   - Centipawn loss = `bestScore - playerMoveScore` (normalized to player's perspective)
   - Quality thresholds: 0–5 → Brilliant/Great, 6–30 → Good, 31–90 → Inaccuracy, 91–200 → Mistake, 200+ → Blunder
   - Keep commentary text pools + `bestAlternative` suggestion (= `pvs[0].moves[0]` SAN)
   - *depends on step 4, parallel with step 5*

---

## Phase 3 — Hook & UI Update (steps 7–8)

7. **Rewrite `client/src/hooks/useCoachGame.ts`**:
   - Import `stockfishService` (singleton) instead of old `chessAI.ts` functions
   - `makePlayerMove()` flow:
     a. Pre-analyze from current FEN: `stockfishService.analyze(fen, { multiPV: 3, depth: 15, skillLevel: 20 })` — start this WHEN it becomes player's turn (background), not when player clicks
     b. On player click: chess.js validates move
     c. Compare played SAN vs analysis result → generate comment via new commentator
   - `coach move` effect:
     a. `stockfishService.analyze(fen, { multiPV: 1, skillLevel: cfg.skillLevel, depth: cfg.depth, movetime: cfg.movetime })`
     b. Extract `bestMove` → `chess.move(bestMove)`
   - Add `engineReady: boolean` to `UseCoachGameReturn` (proxied from service)
   - *depends on steps 4, 5, 6*

8. **Update `client/src/components/CoachGame/CoachGame.tsx`** (minimal):
   - Show `"⚙️ Engine loading…"` spinner overlay when `!engineReady`
   - Pass `engineReady` from hook to component
   - No layout or routing changes
   - *depends on step 7*

---

## Relevant Files

- `client/vite.config.ts` — add WASM + top-level-await plugins
- `client/src/workers/stockfishWorker.ts` — **NEW** — UCI worker
- `client/src/utils/stockfishService.ts` — **NEW** — main-thread service
- `client/src/utils/chessAI.ts` — **REPLACE** content (keep level configs)
- `client/src/utils/moveCommentator.ts` — **REPLACE** content (new signature)
- `client/src/hooks/useCoachGame.ts` — **REPLACE** content
- `client/src/components/CoachGame/CoachGame.tsx` — **MINOR UPDATE** (engine ready state)

---

## Verification

1. `pnpm tsc --noEmit` — zero errors
2. `pnpm build` — clean build, WASM file included in dist
3. Manual: Open app → Play with Coach → board is interactive during coach thinking
4. Manual: Make a blunder (hang a queen) → commentary shows `??` with correct alternative
5. Manual: Grandmaster level plays noticeably stronger than Beginner

---

## Decisions

- **No LLM** — skipped per user
- **Single-threaded WASM** (`stockfish-nnue-16-single.js`) — avoids SharedArrayBuffer/COOP/COEP header requirement; still ~100× stronger than minimax
- **Pre-move analysis**: starts as soon as player's turn begins (background), so commentary is instant after player clicks
- **Scope**: Only engine pipeline changes; all CSS, layout, routing, setup UI are untouched
- **NNUE**: v16 includes neural network evaluation → understands pawn structure, king safety, piece activity (directly addresses "shallow evaluation" weakness)

---

## Further Considerations

1. **Stockfish WASM loading in Vite**: `vite-plugin-wasm` is needed to serve `.wasm` files with the correct MIME type. If it causes issues, fallback is `stockfish@11` (pure JS, no WASM — simpler, ~3× slower but zero config).

2. **Pre-move analysis race condition**: If the player moves very fast before analysis completes, commentary falls back to a quick depth-1 re-analysis. Should add a minimum thinking overlay of ~200ms to prevent accidental instant moves.

3. **Stockfish `Skill Level` vs `UCI_LimitStrength`**: Stockfish 16 supports `UCI_LimitStrength=true` + `UCI_Elo` which gives more precise Elo control than `Skill Level` alone. This could replace the depth-based approach for cleaner level separation.

4. **COOP/COEP headers** (if multi-threaded Stockfish is ever desired): Multi-threaded WASM requires `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` server headers and `SharedArrayBuffer`. The chosen single-threaded build avoids this entirely.
