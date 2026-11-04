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
      key: string;
    }
  /** An old link of the form /#/<id>?ex=...; the app sends it to /<id>/#ex=... */
  | { kind: 'legacy'; target: string };

/**
 * Each visualization has its own page, /<id>/. The hash carries only state:
 * #ex=<code> (a saved example), &embed=1, &lesson=<section>, and for compare mode
 * #compare=<other id>&ex=<code>&exb=<code for the other page>.
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
    theme: params.get('theme'),
    autoplay: params.get('autoplay') === '1',
    practice: Number(params.get('practice')) || null,
    practiceCount: Number(params.get('n')) || 5,
    compare: params.get('compare'),
    codeB: params.get('exb'),
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
  } = {},
): string {
  const params = [
    state.compare ? `compare=${state.compare}` : '',
    state.ex ? `ex=${state.ex}` : '',
    state.compare && state.exb ? `exb=${state.exb}` : '',
    state.embed ? 'embed=1' : '',
    state.embed && state.theme ? `theme=${state.theme}` : '',
    state.embed && state.autoplay ? 'autoplay=1' : '',
  ].filter(Boolean);
  return `/${id}/${params.length ? `#${params.join('&')}` : ''}`;
}
