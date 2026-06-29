// Bundled portrait photos under src/assets/players/<key>.<ext>
// (populated by `npm run download-player-avatars`).
const imageModules = import.meta.glob<{ default: string }>(
  '../../assets/players/*.{jpg,jpeg,png,webp}',
  { eager: true },
);
const IMAGE_BY_KEY: Record<string, string> = {};
for (const path of Object.keys(imageModules)) {
  const m = path.match(/\/players\/([^/]+)\.[a-z]+$/i);
  if (m) IMAGE_BY_KEY[m[1]] = imageModules[path].default;
}

/** Bundled portrait URL for a collection, if one exists. */
export function avatarImage(key: string): string | undefined {
  return IMAGE_BY_KEY[key];
}

// Deterministic initials + gradient avatar — fallback when no photo is bundled
// (e.g. the Lichess Elite collection).

export function avatarInitials(label: string, key: string): string {
  if (key === 'lichess-elite') return '♟';
  const words = label.replace(/\(.*\)/, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// A pair of HSL colors for the avatar gradient, derived from the key.
export function avatarGradient(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const h1 = hash % 360;
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1} 62% 48%), hsl(${h2} 64% 38%))`;
}
