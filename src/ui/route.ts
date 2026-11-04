export type Route =
  | { kind: 'catalog' }
  | { kind: 'viz'; id: string; code: string | null; embed: boolean; key: string };

/** Routes live in the hash (#/stack-array?ex=...&embed=1) so static hosting needs no rewrites. */
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = h.split('?');
  if (!path) return { kind: 'catalog' };
  const params = new URLSearchParams(query);
  return {
    kind: 'viz',
    id: decodeURIComponent(path),
    code: params.get('ex'),
    embed: params.get('embed') === '1',
    key: h,
  };
}
