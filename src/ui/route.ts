export type Route =
  | { kind: 'catalog' }
  | {
      kind: 'viz';
      id: string;
      code: string | null;
      embed: boolean;
      lesson: string | null;
      key: string;
    }
  /** An old link of the form /#/<id>?ex=...; the app sends it to /<id>/#ex=... */
  | { kind: 'legacy'; target: string };

/**
 * Each visualization has its own page, /<id>/. The hash carries only state:
 * #ex=<code> (a saved example), &embed=1, &lesson=<section>.
 */
export function parseLocation(pathname: string, hash: string): Route {
  if (hash.startsWith('#/')) {
    const [path = '', query = ''] = hash.slice(2).split('?');
    if (path) return { kind: 'legacy', target: `/${path}/${query ? `#${query}` : ''}` };
  }
  const id = pathname.split('/').filter(Boolean)[0];
  if (!id) return { kind: 'catalog' };
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return {
    kind: 'viz',
    id: decodeURIComponent(id),
    code: params.get('ex'),
    embed: params.get('embed') === '1',
    lesson: params.get('lesson'),
    key: `${pathname}${hash}`,
  };
}

/** The address of a visualization page, optionally with state in the hash. */
export function vizHref(id: string, state: { ex?: string; embed?: boolean } = {}): string {
  const params = [state.ex ? `ex=${state.ex}` : '', state.embed ? 'embed=1' : ''].filter(Boolean);
  return `/${id}/${params.length ? `#${params.join('&')}` : ''}`;
}
