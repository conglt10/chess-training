// Centralized URL builders for the app's routes.

export const repertoirePath = () => '/repertoire';

export const familyPath = (family: string, color?: string) =>
  `/repertoire/family/${encodeURIComponent(family)}` + (color ? `?color=${encodeURIComponent(color)}` : '');

export const openingPath = (eco: string, name: string) =>
  `/openings/${encodeURIComponent(eco)}/${encodeURIComponent(name)}`;

export const openingGamesPath = (collectionKey?: string) =>
  `/repertoire/games${collectionKey ? `/${encodeURIComponent(collectionKey)}` : ''}`;

export const exercisePath = (eco: string, name: string) =>
  `${openingPath(eco, name)}/exercise`;

export const mastersPlayersPath = (collectionKey?: string) =>
  `/masters/players${collectionKey ? `/${encodeURIComponent(collectionKey)}` : ''}`;

export const mastersExplorePath = (line?: string[]) =>
  `/masters/explore${line && line.length ? `?line=${line.join(',')}` : ''}`;

export const masterGamePath = (gameId: string, opts?: { hero?: string; line?: string[] }) => {
  const q = new URLSearchParams();
  if (opts?.hero) q.set('hero', opts.hero);
  if (opts?.line && opts.line.length) q.set('line', opts.line.join(','));
  const qs = q.toString();
  return `/masters/game/${encodeURIComponent(gameId)}${qs ? `?${qs}` : ''}`;
};
