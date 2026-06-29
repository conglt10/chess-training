import { CLASSIFICATION_META, type Classification } from '../../utils/moveClassifier';

interface Props {
  classification: Classification;
  size?: number;
  title?: boolean;
}

/** A small colored badge with the chess.com-style glyph for a move classification. */
export default function ClassificationIcon({ classification, size = 20, title = true }: Props) {
  const meta = CLASSIFICATION_META[classification];
  const fontSize = meta.glyph.length > 1 ? size * 0.5 : size * 0.62;

  return (
    <span
      className="cls-icon"
      title={title ? meta.label : undefined}
      style={{
        width: size,
        height: size,
        background: meta.color,
        fontSize,
        lineHeight: `${size}px`,
      }}
    >
      {meta.glyph}
    </span>
  );
}
