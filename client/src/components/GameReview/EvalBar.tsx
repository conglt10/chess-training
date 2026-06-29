interface Props {
  /** Evaluation after the current move, WHITE's perspective (centipawns) */
  cp: number;
  /** Mate distance, WHITE's perspective (+ = white mates), or null */
  mate: number | null;
  orientation: 'white' | 'black';
  height: number;
}

const CLAMP = 1000;

/** chess.com-style vertical evaluation bar shown beside the board. */
export default function EvalBar({ cp, mate, orientation, height }: Props) {
  const whiteAhead = mate !== null ? mate > 0 : cp >= 0;

  // Fraction of the bar belonging to White (0..1)
  const whiteFrac = mate !== null
    ? (mate > 0 ? 1 : 0)
    : (Math.max(-CLAMP, Math.min(CLAMP, cp)) + CLAMP) / (2 * CLAMP);

  // White occupies the bottom when the board is shown from White's side.
  const whiteAtBottom = orientation === 'white';
  const whiteStyle = whiteAtBottom
    ? { bottom: 0, height: `${whiteFrac * 100}%` }
    : { top: 0, height: `${whiteFrac * 100}%` };

  const label = mate !== null ? `M${Math.abs(mate)}` : (Math.abs(cp) / 100).toFixed(1);

  // The label sits at the winning side's end of the bar.
  const labelAtBottom = whiteAhead === whiteAtBottom;
  const labelStyle = labelAtBottom ? { bottom: 2 } : { top: 2 };

  return (
    <div className="eval-bar" style={{ height }} title={`Evaluation: ${whiteAhead ? '+' : '-'}${label}`}>
      <div className="eval-bar-white" style={whiteStyle} />
      <span className={`eval-bar-label ${whiteAhead ? 'on-white' : 'on-black'}`} style={labelStyle}>
        {label}
      </span>
    </div>
  );
}
