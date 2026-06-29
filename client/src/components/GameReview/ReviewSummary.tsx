import ClassificationIcon from './ClassificationIcon';
import { CLASSIFICATION_META, CLASSIFICATION_ORDER, type Classification } from '../../utils/moveClassifier';
import type { ParsedGame } from '../../utils/pgnImport';

interface Props {
  game: ParsedGame;
  accuracy: { white: number; black: number };
  counts: { white: Record<Classification, number>; black: Record<Classification, number> };
  openingName: string | null;
  openingEco: string | null;
}

function accClass(a: number): string {
  if (a >= 90) return 'great';
  if (a >= 80) return 'good';
  if (a >= 65) return 'ok';
  return 'poor';
}

export default function ReviewSummary({ game, accuracy, counts, openingName, openingEco }: Props) {
  return (
    <div className="review-summary glass">
      <div className="review-summary-players">
        <div className="review-player">
          <div className="review-player-name">⬜ {game.white}{game.whiteElo ? ` (${game.whiteElo})` : ''}</div>
          <div className={`review-accuracy ${accClass(accuracy.white)}`}>{accuracy.white.toFixed(1)}</div>
          <div className="review-accuracy-label">Accuracy</div>
        </div>
        <div className="review-player">
          <div className="review-player-name">⬛ {game.black}{game.blackElo ? ` (${game.blackElo})` : ''}</div>
          <div className={`review-accuracy ${accClass(accuracy.black)}`}>{accuracy.black.toFixed(1)}</div>
          <div className="review-accuracy-label">Accuracy</div>
        </div>
      </div>

      {openingName && (
        <div className="review-opening">
          {openingEco && <span className="badge badge-gold">{openingEco}</span>}
          <span className="review-opening-name">{openingName}</span>
        </div>
      )}

      <div className="review-counts">
        <div className="review-counts-head">
          <span />
          <span className="review-counts-col">⬜</span>
          <span className="review-counts-col">⬛</span>
        </div>
        {CLASSIFICATION_ORDER.map(c => {
          const w = counts.white[c];
          const b = counts.black[c];
          if (w === 0 && b === 0) return null;
          return (
            <div className="review-count-row" key={c}>
              <span className="review-count-label">
                <ClassificationIcon classification={c} size={18} title={false} />
                <span style={{ color: CLASSIFICATION_META[c].color }}>{CLASSIFICATION_META[c].label}</span>
              </span>
              <span className="review-counts-col">{w}</span>
              <span className="review-counts-col">{b}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
