/**
 * moveClassifier.ts
 *
 * Backwards-compatible re-export of the WhyBlunder chess evaluator
 * (`../review/evaluator/chessEvaluator`). The Game Review taxonomy is the
 * spec-exact 7-class set (brilliant / great / best / book / inaccuracy /
 * mistake / blunder); this module preserves the historical import path used
 * by the board UI, summary, and single-move review.
 */

export {
  type Classification,
  type ClassificationMeta,
  CLASSIFICATION_META,
  CLASSIFICATION_ORDER,
  type ClassifyInput,
  classifyMove,
} from '../review/evaluator/chessEvaluator';
