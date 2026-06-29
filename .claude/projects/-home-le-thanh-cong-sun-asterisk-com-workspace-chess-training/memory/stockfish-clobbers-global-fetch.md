---
name: stockfish-clobbers-global-fetch
description: Server gotcha — initializing the Stockfish WASM engine overwrites global fetch with a non-callable object
metadata:
  type: project
---

On the server, initializing the Stockfish WASM engine (the `stockfish` npm package, Emscripten build) **overwrites the global `fetch` with a non-callable `object`**. After `getPool().warmUp()` runs, any later `fetch(...)` call throws `fetch is not a function`.

**Why:** The Emscripten runtime assigns `globalThis.fetch` during engine init (used internally for wasm loading), clobbering Node 22's native global fetch.

**How to apply:** Server code that needs HTTP must capture the real fetch at module load time, before the pool warms up: `const nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis);`. This is what `server/src/routes/importGame.ts` does. Module imports run before the `server.listen` callback that calls `warmUp()`, so the captured reference stays callable.
