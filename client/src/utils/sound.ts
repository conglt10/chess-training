/**
 * sound.ts
 *
 * Shared move/capture sound effects (Lichess standard sounds), so every mode
 * — exercises, coach, and game review — uses the same audio.
 */

const moveSound = new Audio('https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3');
const captureSound = new Audio('https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Capture.mp3');

export function playMoveSound(isCapture = false): void {
  const sound = isCapture ? captureSound : moveSound;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}
