export type Route =
  | { kind: 'catalog' }
  | {
      kind: 'viz';
      id: string;
      code: string | null;
      embed: boolean;
      lesson: string | null;
      /** Embeds can fix a theme and start playing by themselves. */
      theme: string | null;
      autoplay: boolean;
      /** A practice set to open: #practice=<seed>&n=<count>. */
      practice: number | null;
      practiceCount: number;
      /** Compare mode: the second page (#compare=<id>) and its saved state (&exb=<code>). */
      compare: string | null;
      codeB: string | null;
      /** An example saved in an account and shared (#saved=<id>). */
      saved: string | null;
      /** A lesson list being played (#list=<id>&item=<n>, 1 for its first example). */
      list: string | null;
      item: number;
      key: string;
    }
  /** "My lesson lists" (/#lists), and a lesson list's link (/#list=<id>), on the home page. */
  | { kind: 'lists'; key: string }
  | { kind: 'list'; id: string; key: string }
  /** An old link of the form /#/<id>?ex=...; the app sends it to /<id>/#ex=... */
  | { kind: 'legacy'; target: string };

/**
 * Each visualization has its own page, /<id>/. The hash carries only state:
 * #ex=<code> (a saved example), &embed=1, &lesson=<section>, and for compare mode
 * #compare=<other id>&ex=<code>&exb=<code for the other page>, #saved=<id> for an example
 * shared from an account, and &list=<id>&item=<n> while a lesson list plays. On the home page,
 * #lists is "My lesson lists" and #list=<id> a lesson list's link.
 */
export function parseLocation(pathname: string, hash: string): Route {
  if (hash.startsWith('#/')) {
    const [path = '', query = ''] = hash.slice(2).split('?');
    if (path) return { kind: 'legacy', target: `/${path}/${query ? `#${query}` : ''}` };
  }
  const id = pathname.split('/').filter(Boolean)[0];
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!id) {
    const list = params.get('list');
    if (list) return { kind: 'list', id: list, key: `${pathname}${hash}` };
    if (params.has('lists')) return { kind: 'lists', key: `${pathname}${hash}` };
    return { kind: 'catalog' };
  }
  return {
    kind: 'viz',
    id: decodeURIComponent(id),
    code: params.get('ex'),
    embed: params.get('embed') === '1',
    lesson: params.get('lesson'),
    theme: params.get('theme'),
    autoplay: params.get('autoplay') === '1',
    practice: Number(params.get('practice')) || null,
    practiceCount: Number(params.get('n')) || 5,
    compare: params.get('compare'),
    codeB: params.get('exb'),
    saved: params.get('saved'),
    list: params.get('list'),
    item: Math.max(1, Math.floor(Number(params.get('item'))) || 1),
    key: `${pathname}${hash}`,
  };
}

/** The address of a visualization page, optionally with state in the hash. */
export function vizHref(
  id: string,
  state: {
    ex?: string;
    embed?: boolean;
    theme?: string | null;
    autoplay?: boolean;
    compare?: string;
    exb?: string;
    saved?: string;
    list?: string | null;
    item?: number;
  } = {},
): string {
  const params = [
    state.compare ? `compare=${state.compare}` : '',
    state.ex ? `ex=${state.ex}` : '',
    !state.ex && state.saved ? `saved=${encodeURIComponent(state.saved)}` : '',
    state.compare && state.exb ? `exb=${state.exb}` : '',
    state.embed ? 'embed=1' : '',
    state.embed && state.theme ? `theme=${state.theme}` : '',
    state.embed && state.autoplay ? 'autoplay=1' : '',
    state.list ? `list=${encodeURIComponent(state.list)}` : '',
    state.list && state.item ? `item=${state.item}` : '',
  ].filter(Boolean);
  return `/${id}/${params.length ? `#${params.join('&')}` : ''}`;
}

/** The home page's addresses for lesson lists: "My lesson lists", and a list's link. */
export const listsHref = '/#lists';
export const listHref = (id: string): string => `/#list=${encodeURIComponent(id)}`;

/**
 * Go to an address on this site without reloading the page: App follows it as it follows a
 * change of hash, and Back and Forward come back through the same handler (each address differs
 * in its hash). A lesson list moves this way so Present mode and full screen carry on.
 */
export function navigate(href: string, replace = false): void {
  const oldURL = location.href;
  if (replace) history.replaceState(null, '', href);
  else history.pushState(null, '', href);
  dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: location.href }));
}
