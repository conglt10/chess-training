/**
 * Tiny in-memory request cache for idempotent, static GET data (opening book,
 * master-game collections). The corpus never changes within a session, so
 * caching by request key avoids refetching on every tab switch / navigation.
 *
 * The cached value is the Promise itself, so concurrent callers with the same
 * key share one in-flight request. Failed requests are evicted so they can be
 * retried. Cache lives for the SPA session (cleared on full page reload).
 */
const store = new Map<string, Promise<unknown>>();

export function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Promise<T> | undefined;
  if (hit) return hit;

  const promise = fetcher().catch(err => {
    store.delete(key); // don't cache failures — allow retry
    throw err;
  });
  store.set(key, promise);
  return promise;
}

/** Clear all cached responses (e.g. for a manual refresh action). */
export function clearApiCache(): void {
  store.clear();
}
