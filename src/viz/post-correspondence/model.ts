/**
 * The Post correspondence problem. An instance is a set of dominoes, each with a string on top
 * and one on the bottom; a match is a sequence of dominoes (repeats allowed) whose tops spell the
 * same string as their bottoms. Deciding whether an instance has a match is undecidable.
 *
 * Search looks for a match among sequences of at most `bound` dominoes, breadth first (the
 * default: the first match found is a shortest one) or depth first. A partial match lives only
 * while one string is a prefix of the other; the part the longer one has left over is its
 * overhang, and it alone decides how the partial match can go on. Each partial match taken from
 * the frontier is extended by every domino: the extension dies when the strings disagree, is a
 * match when they agree all the way, is cut off when it already has `bound` dominoes, and is
 * skipped (with `memo` on) when an earlier partial match had the same overhang. If the frontier
 * runs out with nothing cut off, no match exists at any length.
 *
 * Try checks one sequence of dominoes, domino by domino. Load reads a new instance.
 *
 * Text: dominoes as top/bottom, separated by spaces or commas, with or without brackets:
 * "b/ca a/ab ca/a abc/c". Dominoes are numbered from 1 in the order typed.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';

export interface Domino {
  top: string;
  bottom: string;
}

export interface PcpSettings {
  [key: string]: Scalar;
  method: 'bfs' | 'dfs';
  /** The most dominoes in a sequence the search builds. */
  bound: number;
  /** Skip a partial match whose overhang an earlier one at the same depth or less already had. */
  memo: boolean;
  /** 'first': the match must start with domino 1 (Sipser's modified PCP). */
  first: 'any' | 'first';
}

export const defaults: PcpSettings = { method: 'bfs', bound: 6, memo: false, first: 'any' };

/** A sequence of dominoes (0-based indices) with the strings it spells. */
export interface Partial {
  seq: number[];
  top: string;
  bottom: string;
}

export type Verdict = 'alive' | 'dead' | 'match' | 'cut' | 'seen';

export interface Tried extends Partial {
  verdict: Verdict;
  /** Where the strings first disagree (0-based), for a dead one. */
  at?: number;
}

export interface PcpSearch {
  method: 'bfs' | 'dfs';
  bound: number;
  /** Next first: the queue's front, or the stack's top. */
  frontier: Partial[];
  /** The partial match being extended, and the extension just tried. */
  current: Partial | null;
  tried: Tried | null;
  /** This expansion's verdicts so far, by domino. */
  outcomes: Record<number, Verdict>;
  expanded: number;
  dead: number;
  cut: number;
  skipped: number;
  found: number[] | null;
  over: 'match' | 'empty' | 'limit' | null;
}

export interface PcpState {
  dominoes: Domino[];
  search: PcpSearch | null;
  /** Try's sequence as it stands. */
  check: Tried | null;
}

type S = PcpState;
type Op = OpSpec<S, PcpSettings, unknown>;
type PcpStep = Step<S, unknown>;

export const MAX_DOMINOES = 6;
export const MAX_SIDE = 5;
/** Partial matches a search extends at most, so a search ends in a few hundred steps. */
export const MAX_EXPAND = 60;
export const MAX_TRY = 16;

/** The page starts on Sipser's first example, whose shortest match is 2 1 3 2 4. */
export const START_TEXT = 'b/ca a/ab ca/a abc/c';

const SIDE = /^[A-Za-z0-9]+$/;

export function parseInstance(raw: string): Domino[] | Error {
  const items = raw
    .replace(/[[\]]/g, ' ')
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (!items.length) return new Error('Type dominoes as top/bottom, such as b/ca a/ab ca/a abc/c.');
  if (items.length > MAX_DOMINOES)
    return new Error(`Use at most ${MAX_DOMINOES} dominoes, so they fit on the stage.`);
  const out: Domino[] = [];
  for (const item of items) {
    const parts = item.split('/');
    if (parts.length !== 2)
      return new Error(`"${item}" is not a domino. Write each domino as top/bottom, such as ab/a.`);
    const [top, bottom] = parts as [string, string];
    for (const s of [top, bottom]) {
      if (!s)
        return new Error(`"${item}" has an empty side. Give each side 1 to ${MAX_SIDE} symbols.`);
      if (!SIDE.test(s)) return new Error(`"${item}": use letters and digits only, such as ab/a.`);
      if (s.length > MAX_SIDE)
        return new Error(`"${item}": keep each side to ${MAX_SIDE} symbols or fewer.`);
    }
    out.push({ top, bottom });
  }
  return out;
}

export const formatInstance = (ds: readonly Domino[]): string =>
  ds.map((d) => `${d.top}/${d.bottom}`).join(' ');

/** "2 1 3" -> [1, 0, 2], checked against the number of dominoes. */
export function parseSequence(raw: string, n: number): number[] | Error {
  const t = raw.trim();
  if (!/^\d+([\s,]+\d+)*$/.test(t))
    return new Error(
      `"${t}" is not a sequence of dominoes. Type their numbers, such as 2 1 3, or load dominoes such as ab/a.`,
    );
  const seq = t.split(/[\s,]+/).map(Number);
  if (seq.length > MAX_TRY) return new Error(`Try at most ${MAX_TRY} dominoes at a time.`);
  const bad = seq.find((k) => k < 1 || k > n);
  if (bad !== undefined)
    return new Error(`There is no domino ${bad}: the dominoes are numbered 1 to ${n}.`);
  return seq.map((k) => k - 1);
}

export const seqText = (seq: readonly number[]): string =>
  seq.length ? seq.map((k) => k + 1).join(' ') : 'nothing yet';

/** Where the two strings first disagree, or -1 if one is a prefix of the other. */
export function mismatchAt(top: string, bottom: string): number {
  const k = Math.min(top.length, bottom.length);
  for (let i = 0; i < k; i++) if (top[i] !== bottom[i]) return i;
  return -1;
}

/** The side that is ahead and what it has left over: "T:ca", "B:b", or "" when even. */
export function overhangKey(p: Pick<Partial, 'top' | 'bottom'>): string {
  const k = Math.min(p.top.length, p.bottom.length);
  if (p.top.length > k) return `T:${p.top.slice(k)}`;
  if (p.bottom.length > k) return `B:${p.bottom.slice(k)}`;
  return '';
}

export function overhangText(p: Pick<Partial, 'top' | 'bottom'>): string {
  const key = overhangKey(p);
  if (!key) return 'even';
  return `${key[0] === 'T' ? 'top' : 'bottom'} +${key.slice(2)}`;
}

export function extend(ds: readonly Domino[], p: Partial, i: number): Partial {
  return { seq: [...p.seq, i], top: p.top + ds[i]!.top, bottom: p.bottom + ds[i]!.bottom };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const dominoId = (i: number) => `dom-${i}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function init(): S {
  return { dominoes: parseInstance(START_TEXT) as Domino[], search: null, check: null };
}

function searchVars(r: PcpSearch): Record<string, Scalar> {
  return {
    depth: r.tried?.seq.length ?? r.current?.seq.length ?? 0,
    expanded: r.expanded,
    dead: r.dead,
    'cut off': r.cut,
    frontier: r.frontier.length,
    ...(r.skipped ? { skipped: r.skipped } : {}),
  };
}

export function vars(s: S): Record<string, Scalar> {
  if (s.search) return searchVars(s.search);
  return { dominoes: s.dominoes.length, ...(s.check ? { length: s.check.seq.length } : {}) };
}

const cloneSearch = (r: PcpSearch): PcpSearch => ({
  ...r,
  frontier: [...r.frontier],
  outcomes: { ...r.outcomes },
});

/** Strings in narration: ε for the empty one. */
const str = (w: string) => (w === '' ? 'ε' : w);

function describeTry(t: Tried): string {
  if (t.verdict === 'dead')
    return `top ${t.top} and bottom ${t.bottom} disagree at column ${t.at! + 1} (${t.top[t.at!]} against ${t.bottom[t.at!]})`;
  if (t.verdict === 'match') return `top and bottom both spell ${t.top}`;
  return `top ${str(t.top)}, bottom ${str(t.bottom)}: ${overhangText(t) === 'even' ? 'even' : `the ${overhangText(t).replace(' +', ' is ahead by ')}`}`;
}

const search: Op = {
  label: 'Search',
  arity: 0,
  *run(s, _args, { settings }) {
    const ds = s.dominoes;
    const bound = Math.max(1, Math.min(12, Math.round(settings.bound)));
    const dfs = settings.method === 'dfs';
    const where = dfs ? 'stack' : 'queue';
    const r: PcpSearch = {
      method: settings.method,
      bound,
      frontier: [{ seq: [], top: '', bottom: '' }],
      current: null,
      tried: null,
      outcomes: {},
      expanded: 0,
      dead: 0,
      cut: 0,
      skipped: 0,
      found: null,
      over: null,
    };
    const seen = new Map<string, number>();
    const at = (): S => ({ ...s, search: cloneSearch(r), check: null });
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): PcpStep => {
      const state = at();
      return { state, marks, say, lines, level, vars: searchVars(state.search!) };
    };
    yield step(
      `Search for a match of at most ${plural(bound, 'domino', 'dominoes')}, ${dfs ? 'depth first' : 'breadth first'}. Start with the empty sequence: top and bottom are both empty.${settings.first === 'first' ? ' The match must start with domino 1.' : ''}`,
      ['init'],
      2,
    );
    for (;;) {
      if (!r.frontier.length) {
        // The last partial match extended stays on the stage.
        r.tried = null;
        r.outcomes = {};
        r.over = 'empty';
        const proof = !r.cut;
        yield step(
          proof
            ? `The ${where} is empty and nothing was cut off: every way to go on died${r.skipped ? ' or repeated an overhang seen before' : ''}. So ${settings.first === 'first' ? 'no match of any length starts with domino 1' : 'this instance has no match, of any length'}.`
            : `The ${where} is empty. No match of up to ${plural(bound, 'domino', 'dominoes')}, but ${plural(r.cut, 'partial match was', 'partial matches were')} cut off at the bound, so a longer match may still exist.`,
          ['empty'],
          1,
          [mark('status', proof ? 'found' : 'error')],
        );
        return at();
      }
      if (r.expanded >= MAX_EXPAND) {
        r.over = 'limit';
        r.tried = null;
        r.outcomes = {};
        yield step(
          `That is ${MAX_EXPAND} partial matches extended, the most this page tries, and ${plural(r.frontier.length, 'is', 'are')} still waiting. No match yet.`,
          ['loop'],
          1,
          [mark('status', 'error')],
        );
        return at();
      }
      const node = r.frontier.shift()!;
      r.current = node;
      r.tried = null;
      r.outcomes = {};
      r.expanded++;
      const label = node.seq.length ? seqText(node.seq) : 'the empty sequence';
      yield step(
        `Take ${label} from the ${where}${node.seq.length ? ` (${overhangText(node)})` : ''} and try each domino after it.`,
        ['loop', 'take'],
        3,
        [mark('match-row', 'active')],
      );
      const children: Partial[] = [];
      const only = settings.first === 'first' && !node.seq.length;
      for (let i = 0; i < ds.length; i++) {
        if (only && i > 0) break;
        const c = extend(ds, node, i);
        const p = mismatchAt(c.top, c.bottom);
        let verdict: Verdict;
        let say: string;
        const lines = ['loop', 'each'];
        if (p >= 0) {
          verdict = 'dead';
          r.dead++;
          say = `Add domino ${i + 1}: ${describeTry({ ...c, verdict, at: p })}. Dead: no dominoes added later can fix that.`;
          lines.push('dead');
        } else if (c.top === c.bottom) {
          verdict = 'match';
          r.found = c.seq;
          r.over = 'match';
          r.tried = { ...c, verdict };
          r.outcomes[i] = verdict;
          yield step(
            `Add domino ${i + 1}: top and bottom both spell ${c.top}. A match: ${seqText(c.seq)}, ${plural(c.seq.length, 'domino', 'dominoes')}${dfs ? '' : ', and breadth first finds a shortest one'}.`,
            ['loop', 'each', 'match'],
            1,
            [mark('status', 'found'), mark(dominoId(i), 'found')],
          );
          return at();
        } else if (c.seq.length >= bound) {
          verdict = 'cut';
          r.cut++;
          say = `Add domino ${i + 1}: ${describeTry({ ...c, verdict })}. Still alive, but that is ${plural(bound, 'domino', 'dominoes')}, the bound: cut off. Not dead, just not followed.`;
          lines.push('bound');
        } else if (settings.memo && (seen.get(overhangKey(c)) ?? Infinity) <= c.seq.length) {
          verdict = 'seen';
          r.skipped++;
          say = `Add domino ${i + 1}: ${describeTry({ ...c, verdict })}. An earlier partial match had this overhang, and the overhang alone decides how it can go on: skip it.`;
          lines.push('seen');
        } else {
          verdict = 'alive';
          seen.set(overhangKey(c), c.seq.length);
          children.push(c);
          say = `Add domino ${i + 1}: ${describeTry({ ...c, verdict })}. Alive: put ${seqText(c.seq)} on the ${where}.`;
          lines.push('push');
        }
        r.tried = { ...c, verdict, ...(p >= 0 ? { at: p } : {}) };
        r.outcomes[i] = verdict;
        if (verdict === 'alive') {
          // Breadth first queues at the back; depth first stacks on top, domino 1 first in line.
          if (dfs) r.frontier.splice(children.length - 1, 0, c);
          else r.frontier.push(c);
        }
        yield step(say, lines, 3, [
          mark(dominoId(i), verdict === 'dead' ? 'error' : verdict === 'alive' ? 'new' : 'stale'),
        ]);
      }
      const told = (v: Verdict) =>
        Object.entries(r.outcomes)
          .filter(([, x]) => x === v)
          .map(([k]) => Number(k) + 1);
      const parts = [
        told('alive').length &&
          `${listOf(told('alive'))} ${told('alive').length === 1 ? 'goes' : 'go'} on`,
        told('dead').length &&
          `${listOf(told('dead'))} ${told('dead').length === 1 ? 'dies' : 'die'}`,
        told('cut').length &&
          `${listOf(told('cut'))} ${told('cut').length === 1 ? 'is' : 'are'} cut off`,
        told('seen').length &&
          `${listOf(told('seen'))} ${told('seen').length === 1 ? 'repeats' : 'repeat'} an overhang`,
      ].filter(Boolean);
      r.tried = null;
      yield step(
        `After ${label}: domino ${parts.join('; ')}. ${plural(r.frontier.length, 'partial match', 'partial matches')} ${r.frontier.length === 1 ? 'waits' : 'wait'} on the ${where}.`,
        ['loop'],
        2,
        Object.entries(r.outcomes).map(([k, v]) =>
          mark(dominoId(Number(k)), v === 'dead' ? 'error' : v === 'alive' ? 'new' : 'stale'),
        ),
      );
    }
  },
};

const listOf = (xs: number[]) =>
  xs.length <= 1 ? String(xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

const tryOp: Op = {
  label: 'Try',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '');
    const seq = parseSequence(text, s.dominoes.length);
    if (seq instanceof Error) {
      yield {
        state: s,
        marks: [mark('status', 'error')],
        say: `Nothing tried. ${text.includes('/') ? 'That looks like dominoes: press Load to load them.' : seq.message}`,
        lines: ['try.sig'],
        vars: vars(s),
        level: 1,
      } satisfies PcpStep;
      return s;
    }
    let p: Partial = { seq: [], top: '', bottom: '' };
    let state: S = s;
    for (const [k, i] of seq.entries()) {
      p = extend(s.dominoes, p, i);
      const at = mismatchAt(p.top, p.bottom);
      const last = k === seq.length - 1;
      const verdict: Verdict = at >= 0 ? 'dead' : p.top === p.bottom ? 'match' : 'alive';
      state = { ...s, search: null, check: { ...p, verdict, ...(at >= 0 ? { at } : {}) } };
      const step = (say: string, line: string, level: 1 | 2, role: Mark['role']): PcpStep => ({
        state,
        marks: [mark(dominoId(i), role), ...(level === 1 ? [mark('status', role)] : [])],
        say,
        lines: ['try.add', line],
        vars: vars(state),
        level,
      });
      if (verdict === 'dead') {
        yield step(
          `Domino ${i + 1}: ${describeTry(state.check!)}. ${seqText(p.seq)} can never become a match, so stop${last ? '' : ` before domino ${seq[k + 1]! + 1}`}.`,
          'try.dead',
          1,
          'error',
        );
        return state;
      }
      if (last) {
        yield step(
          verdict === 'match'
            ? `Domino ${i + 1}: top and bottom both spell ${p.top}. ${seqText(p.seq)} is a match.`
            : `Domino ${i + 1}: ${describeTry(state.check!)}. Not a match: the strings agree so far, but the ${overhangText(p).split(' ')[0]} is longer.`,
          verdict === 'match' ? 'try.match' : 'try.short',
          1,
          verdict === 'match' ? 'found' : 'active',
        );
        return state;
      }
      yield step(`Domino ${i + 1}: ${describeTry(state.check!)}.`, 'try.prefix', 2, 'active');
    }
    return state;
  },
};

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '').trim();
    const ds = parseInstance(text);
    if (ds instanceof Error) {
      const hint = /^\d+([\s,]+\d+)*$/.test(text)
        ? `${text} looks like a sequence of dominoes: press Try to check it.`
        : ds.message;
      yield {
        state: s,
        marks: [mark('status', 'error')],
        say: `Nothing loaded. ${hint} The dominoes stay as they were.`,
        lines: ['load.read'],
        vars: vars(s),
        level: 1,
      } satisfies PcpStep;
      return s;
    }
    const state: S = { dominoes: ds, search: null, check: null };
    yield {
      state,
      marks: ds.map((_, i) => mark(dominoId(i), 'new')),
      say: `Loaded ${plural(ds.length, 'domino', 'dominoes')}: ${ds.map((d, i) => `${i + 1} is ${d.top} over ${d.bottom}`).join(', ')}. Press Search to look for a match, or type numbers such as 1 2 and press Try.`,
      lines: ['load.read'],
      vars: vars(state),
      level: 1,
    } satisfies PcpStep;
    return state;
  },
};

export const ops = { load, search, try: tryOp };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PcpSettings): PseudoBlock[] {
  const dfs = settings.method === 'dfs';
  const F = dfs ? 'stack' : 'queue';
  return [
    {
      op: 'search',
      lines: [
        L('sig', 0, `SEARCH(dominoes, bound)`, 'To look for a match:'),
        L('init', 1, `${F} = [ε]`, `Start with the empty sequence on the ${F}.`),
        L('loop', 1, `while ${F} is not empty`, `While some partial match waits on the ${F}:`),
        L(
          'take',
          2,
          dfs ? 's = pop()' : 's = dequeue()',
          dfs ? 'take the one on top;' : 'take the one at the front;',
        ),
        L(
          'each',
          2,
          settings.first === 'first' ? 'for each domino d (only d₁ if s = ε)' : 'for each domino d',
          settings.first === 'first'
            ? 'try each domino after it (the first must be domino 1):'
            : 'try each domino after it:',
        ),
        L(
          'match',
          3,
          'if top(sd) = bottom(sd): return sd',
          'if the strings are equal, it is a match;',
        ),
        L(
          'dead',
          3,
          'else if neither is a prefix of the other: drop sd',
          'if they disagree somewhere, it is dead;',
        ),
        L(
          'bound',
          3,
          'else if |sd| = bound: cut sd off',
          'if it is as long as allowed, stop there;',
        ),
        ...(settings.memo
          ? [
              L(
                'seen',
                3,
                'else if overhang(sd) was seen: skip sd',
                'if an earlier one left the same overhang, skip it;',
              ),
            ]
          : []),
        L('push', 3, dfs ? 'else push(sd)' : 'else enqueue(sd)', `otherwise put it on the ${F}.`),
        L(
          'empty',
          1,
          'return "no match up to the bound"',
          'Nothing left: no match (of any length, if nothing was cut off).',
        ),
      ],
    },
    {
      op: 'try',
      lines: [
        L('try.sig', 0, 'TRY(i₁ … iₖ)', 'To check a sequence of dominoes:'),
        L('try.add', 1, 'for each i: top += tᵢ; bottom += bᵢ', 'add the dominoes one at a time;'),
        L(
          'try.prefix',
          2,
          'one is a prefix of the other: go on',
          'while the strings agree, keep going;',
        ),
        L(
          'try.dead',
          2,
          'else: not a match, stop',
          'when they disagree, stop: it can never match.',
        ),
        L('try.match', 1, 'if top = bottom: a match', 'Equal strings at the end: a match.'),
        L('try.short', 1, 'else: not (yet) a match', 'Otherwise one string is still longer.'),
      ],
    },
    {
      op: 'load',
      lines: [
        L('load.sig', 0, 'LOAD(t₁/b₁ … tₙ/bₙ)', 'To load dominoes:'),
        L('load.read', 1, 'domino i has tᵢ on top and bᵢ below', 'read each one as top/bottom.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${plural(s.dominoes.length, 'domino', 'dominoes')}, each with a string on top and one below. Can you line up copies of them, repeats allowed, so the tops spell the same string as the bottoms? Press Search, or type numbers such as 2 1 3 and press Try.`;
}

export function initialVars(s: S) {
  return vars(s);
}

export function describe(s: S): string {
  const ds = `Dominoes: ${s.dominoes.map((d, i) => `${i + 1}: ${d.top} over ${d.bottom}`).join('; ')}.`;
  const r = s.search;
  if (r) {
    const now = r.tried ?? r.current;
    const parts = [
      ds,
      now
        ? `Partial match ${seqText(now.seq)}: top ${str(now.top)}, bottom ${str(now.bottom)}.`
        : '',
      `${r.frontier.length} waiting; ${r.expanded} extended, ${r.dead} dead, ${r.cut} cut off.`,
      r.found ? `Match found: ${seqText(r.found)}.` : '',
    ];
    return parts.filter(Boolean).join(' ');
  }
  if (s.check)
    return `${ds} Trying ${seqText(s.check.seq)}: top ${s.check.top}, bottom ${s.check.bottom}, ${s.check.verdict}.`;
  return ds;
}
