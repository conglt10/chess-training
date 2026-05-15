import { useEffect, useRef } from 'react';
import './MoveTable.css';
import { parseMoves } from '../../utils/pgn';

interface MoveTableProps {
  moves: string[];
  currentMoveIndex: number;
}

export default function MoveTable({ moves, currentMoveIndex }: MoveTableProps) {
  const entries = parseMoves(moves);
  const activeRowRef = useRef<HTMLDivElement | null>(null);

  // Scroll active row into view
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentMoveIndex]);

  const getWhiteStatus = (rowIdx: number) => {
    const whiteIdx = rowIdx * 2;
    if (whiteIdx < currentMoveIndex) return 'done';
    if (whiteIdx === currentMoveIndex) return 'current';
    return 'pending';
  };

  const getBlackStatus = (rowIdx: number) => {
    const blackIdx = rowIdx * 2 + 1;
    if (blackIdx < currentMoveIndex) return 'done';
    if (blackIdx === currentMoveIndex) return 'current';
    return 'pending';
  };

  const progressPct = moves.length > 0 ? Math.round((currentMoveIndex / moves.length) * 100) : 0;

  return (
    <div className="move-table-wrap">
      <div className="move-table-header">
        <div className="move-table-title">
          <span>📋</span> Move Order
        </div>
        <div className="move-table-progress">
          <span className="move-table-progress-val">{currentMoveIndex}</span>
          <span> / {moves.length}</span>
        </div>
      </div>

      <div className="move-table-col-headers">
        <div className="move-table-col-label">#</div>
        <div className="move-table-col-label">⬜ White</div>
        <div className="move-table-col-label">⬛ Black</div>
      </div>

      <div className="move-table-body">
        {entries.map((entry, rowIdx) => {
          const whiteStatus = getWhiteStatus(rowIdx);
          const blackStatus = entry.black ? getBlackStatus(rowIdx) : 'empty';
          const isActiveRow = whiteStatus === 'current' || blackStatus === 'current';

          return (
            <div
              key={entry.moveNumber}
              id={`move-row-${entry.moveNumber}`}
              className={`move-table-row ${isActiveRow ? 'active-row' : ''}`}
              ref={isActiveRow ? activeRowRef : null}
            >
              <span className="move-num">{entry.moveNumber}.</span>
              <span className={`move-cell ${whiteStatus}`}>
                {entry.white}
              </span>
              <span className={`move-cell ${blackStatus}`}>
                {entry.black || ''}
              </span>
            </div>
          );
        })}
      </div>

      <div className="move-table-footer">
        <div className="move-table-progress-bar">
          <div
            className="move-table-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
