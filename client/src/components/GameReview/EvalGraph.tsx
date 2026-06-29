import { useMemo } from 'react';

interface Props {
  /** White-perspective centipawns after each move (clamped), length = number of moves */
  evalSeries: number[];
  currentPly: number;        // -1 = start
  onSelectPly: (ply: number) => void;
}

const CLAMP = 1000;
const W = 600;
const H = 120;

/** chess.com-style evaluation bar-graph: the white share of each column tracks the eval. */
export default function EvalGraph({ evalSeries, currentPly, onSelectPly }: Props) {
  const n = evalSeries.length;

  const { areaPath, linePath } = useMemo(() => {
    if (n === 0) return { areaPath: '', linePath: '' };
    const xFor = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const yFor = (cp: number) => {
      const c = Math.max(-CLAMP, Math.min(CLAMP, cp));
      return H * (1 - (c + CLAMP) / (2 * CLAMP)); // white winning → small y (line high), white fills below
    };

    const pts = evalSeries.map((cp, i) => `${xFor(i).toFixed(1)},${yFor(cp).toFixed(1)}`);
    const line = `M ${pts.join(' L ')}`;
    // White area = below the line down to the bottom (white advantage = bigger white region)
    const area = `M 0,${H} L ${evalSeries
      .map((cp, i) => `${xFor(i).toFixed(1)},${yFor(cp).toFixed(1)}`)
      .join(' L ')} L ${W},${H} Z`;
    return { areaPath: area, linePath: line };
  }, [evalSeries, n]);

  if (n === 0) return null;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const ply = Math.round(frac * (n - 1));
    onSelectPly(Math.max(0, Math.min(n - 1, ply)));
  };

  const markerX = currentPly >= 0 ? (n === 1 ? W / 2 : (currentPly / (n - 1)) * W) : null;

  return (
    <div className="eval-graph">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onClick={handleClick}
        role="img"
        aria-label="Evaluation graph"
      >
        {/* dark background = black's share */}
        <rect x={0} y={0} width={W} height={H} fill="#403e3a" />
        {/* white's share */}
        <path d={areaPath} fill="#f5f5f0" />
        {/* midline (equal) */}
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#8a8a8a" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        {/* eval line */}
        <path d={linePath} fill="none" stroke="#5a5a5a" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {/* current move marker */}
        {markerX !== null && (
          <line x1={markerX} y1={0} x2={markerX} y2={H} stroke="#f6c000" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
    </div>
  );
}
