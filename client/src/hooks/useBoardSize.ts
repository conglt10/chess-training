import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Measures a container and returns a square board size that fits inside it,
 * mirroring the responsive board sizing used by the coach mode.
 *
 * Uses a callback ref (not a plain ref + mount effect) so it works even when the
 * measured element mounts LATER than the hook — e.g. the Game Review board only
 * appears once analysis finishes. A mount-time effect would attach its
 * ResizeObserver while the element is still null and never retry, leaving the
 * board stuck at the minimum size.
 *
 * @param reserveBelow - vertical space (px) to leave for controls under the board
 * @param reserveSide  - horizontal space (px) to leave beside the board (e.g. an eval bar)
 */
export function useBoardSize(reserveBelow = 0, min = 320, max = 720, reserveSide = 0) {
  const [size, setSize] = useState(min);
  const elRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const compute = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const pad = 48; // 24px breathing room each side
    const { width, height } = el.getBoundingClientRect();
    if (width === 0 || height === 0) return; // not laid out yet
    setSize(prev => {
      const next = Math.max(min, Math.min(max, Math.floor(Math.min(width - pad - reserveSide, height - pad - reserveBelow))));
      return next !== prev ? next : prev;
    });
  }, [reserveBelow, min, max, reserveSide]);

  const ref = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    elRef.current = node;
    if (node) {
      const ro = new ResizeObserver(() => compute());
      ro.observe(node);
      roRef.current = ro;
      compute();
    }
  }, [compute]);

  // Recompute when sizing params change (the observer stays attached).
  useEffect(() => { compute(); }, [compute]);
  // Disconnect on unmount.
  useEffect(() => () => roRef.current?.disconnect(), []);

  return { ref, size };
}
