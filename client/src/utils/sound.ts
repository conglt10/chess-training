/**
 * sound.ts
 *
 * Shared move/capture sound effects, so every mode — exercises, coach, and game
 * review — uses the same audio.
 *
 * The files are bundled locally (client/public/sounds) rather than fetched from
 * an external host: a remote CDN can be blocked by corporate proxies/CSP and
 * adds latency, which previously left some modes (notably Play with Coach)
 * silent. Local assets always load.
 *
 * Autoplay policy: sounds triggered from async callbacks (e.g. the coach's reply
 * move, which plays after an engine round-trip) are only allowed once the page
 * has "sticky activation". We prime the audio elements on the first user gesture
 * so those later, non-gesture-bound plays are permitted.
 */

const moveSound = new Audio('/sounds/move.mp3');
const captureSound = new Audio('/sounds/capture.mp3');
moveSound.preload = 'auto';
captureSound.preload = 'auto';

let unlocked = false;

function unlock(): void {
  if (unlocked) return;
  unlocked = true;
  for (const a of [moveSound, captureSound]) {
    // Play muted then immediately pause/reset to satisfy the autoplay policy
    // within this user gesture, granting later programmatic plays.
    const prevMuted = a.muted;
    a.muted = true;
    a.play()
      .then(() => { a.pause(); a.currentTime = 0; a.muted = prevMuted; })
      .catch(() => { a.muted = prevMuted; });
  }
}

if (typeof window !== 'undefined') {
  const opts = { once: true, passive: true } as const;
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('keydown', unlock, opts);
  window.addEventListener('touchstart', unlock, opts);
}

export function playMoveSound(isCapture = false): void {
  const sound = isCapture ? captureSound : moveSound;
  try {
    sound.currentTime = 0;
    void sound.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
