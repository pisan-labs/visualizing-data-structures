/**
 * The pattern map: problem cues → patterns → pages (PLAN.md 21.3). Three views of one map:
 * the overview of the families, one family with its cues and patterns, and one of our problem
 * statements read for its cues. Operations:
 *
 * - pick(cue): find the cue in its family, hop to its pattern (with the reason), hop to the page;
 * - family(name): one family, a step per pattern;
 * - which(problem): read a statement of ours cue by cue, ruling out look-alikes, to its pattern;
 * - map(): the families in turn, on the overview.
 *
 * The map's data is in ./map.ts. Whether a page is live is read when the site is built, so the
 * narration links (and the drawing marks) only the pages that exist.
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import {
  CUES,
  FAMILIES,
  NODES,
  PROBLEMS,
  cue,
  cuesOf,
  familyCues,
  familyOf,
  live,
  node,
  type Cue,
  type Find,
  type Problem,
} from './map';

export interface PmSettings {
  [key: string]: Scalar;
  /** Which pattern? also follows the look-alike cues in a statement, and rules them out. */
  lookalikes: boolean;
  /** Following a cue ends with what the naive way costs against the pattern. */
  naive: boolean;
}

export const defaults: PmSettings = { lookalikes: true, naive: true };

export type Mode = 'overview' | 'family' | 'problem';

export interface PmState {
  mode: Mode;
  /** The family on screen (family view), or in focus on the overview; -1 for none. */
  family: number;
  /** Family view: the cue being followed. */
  cue: string | null;
  /** The pattern reached: by the cue, or the answer to the problem. */
  node: string | null;
  /** The last hop, pattern → page, is done. */
  page: boolean;
  /** Problem view: the index in PROBLEMS. */
  problem: number;
  /** Problem view: how many of its shown finds have been read, and followed to a pattern. */
  read: number;
  hopped: number;
}

type S = PmState;
type Op = OpSpec<S, PmSettings, unknown>;
type PmStep = Step<S, unknown>;

/** Shape ids the view draws, for marks. */
export const HEAD = 'head';
export const PROB = 'prob';
export const VERDICT = 'verdict';
export const famId = (f: number) => `fam-${f}`;
export const cueId = (id: string) => `cue-${id}`;
export const arrowId = (id: string) => `arr-${id}`;
export const nodeId = (id: string) => `node-${id}`;
export const pageId = (id: string) => `page-${id}`;
export const wordsId = (k: number) => `w-${k}`;

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export function init(): S {
  return {
    mode: 'overview',
    family: -1,
    cue: null,
    node: null,
    page: false,
    problem: -1,
    read: 0,
    hopped: 0,
  };
}

const blank = init();

// ----- Finding what the learner typed -----

/** Lower case, straight quotes, no quotes or end punctuation around it, single spaces. */
export function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'\s]+|["'.!?,;:\s]+$/g, '');
}

/** A whole number written as one, such as "3" (not "3x" or "1.5"). */
function wholeNumber(text: string): number | null {
  return /^\d{1,4}$/.test(text) ? Number(text) : null;
}

/**
 * The cue the text names: its exact words, or the first cue that contains the text (3 letters
 * or more), or the longest cue the text contains ("find the k largest values" holds "the k
 * largest").
 */
export function findCue(text: string): Cue | null {
  const t = norm(text);
  if (!t) return null;
  const exact = CUES.find((q) => norm(q.text) === t);
  if (exact) return exact;
  if (t.length >= 3) {
    const part = CUES.find((q) => norm(q.text).includes(t));
    if (part) return part;
  }
  const inside = CUES.filter((q) => t.includes(norm(q.text)));
  return inside.sort((a, b) => b.text.length - a.text.length)[0] ?? null;
}

/** The node the text names, by its name or its page id. */
function findNode(text: string): string | null {
  const t = norm(text);
  if (t.length < 3) return null;
  return (
    NODES.find((n) => norm(n.name) === t || n.page === t)?.id ??
    NODES.find((n) => norm(n.name).includes(t))?.id ??
    null
  );
}

/** The family the text names: 1 to 11, its name, or a cue or pattern in it. */
export function findFamily(text: string): number {
  const t = norm(text);
  const k = wholeNumber(t);
  if (k !== null) return k >= 1 && k <= FAMILIES.length ? k - 1 : -1;
  if (!t) return -1;
  const named = FAMILIES.findIndex((f) => norm(f.name) === t);
  if (named >= 0) return named;
  if (t.length >= 3) {
    const part = FAMILIES.findIndex((f) => norm(f.name).includes(t));
    if (part >= 0) return part;
  }
  const q = findCue(text);
  if (q) return familyOf(q.node);
  const n = findNode(text);
  return n ? familyOf(n) : -1;
}

/** The problem the text names: 1 to 12, its title, a cue it contains, or the pattern it needs. */
export function findProblem(text: string): number {
  const t = norm(text);
  const k = wholeNumber(t);
  if (k !== null) return k >= 1 && k <= PROBLEMS.length ? k - 1 : -1;
  if (t.length < 3) return -1;
  const named = PROBLEMS.findIndex((p) => p.id === t || p.title.includes(t));
  if (named >= 0) return named;
  const q = findCue(text);
  if (q) {
    const has = PROBLEMS.findIndex((p) => p.finds.some((f) => f.cue === q.id));
    if (has >= 0) return has;
  }
  const n = findNode(text);
  return n ? PROBLEMS.findIndex((p) => p.answer === n) : -1;
}

/** The finds Which pattern? reads: every one, or only those that point to the answer. */
export const shownFinds = (p: Problem, s: PmSettings): Find[] =>
  s.lookalikes ? p.finds : p.finds.filter((f) => !f.trap);

// ----- Narration pieces -----

const quoted = (t: string) => `“${t}”`;

function list(xs: string[]): string {
  return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : (xs[0] ?? '');
}

/** "The naive way: …. With the pattern: …." (for a Concurrency page: the trouble, and the fix). */
export function costSay(id: string): string {
  const n = node(id);
  return n.kind === 'sync'
    ? `The trouble: ${n.naive}. The fix: ${n.gain}.`
    : `The naive way: ${n.naive}. With the pattern: ${n.gain}.`;
}

/** Where to practise the pattern: its page, when it is live. */
export function pageSay(id: string): string {
  const n = node(id);
  return live(id) ? `Its page is /${n.page}/.` : `Its page is not live yet.`;
}

const liveCount = (ids: readonly string[]) => ids.filter(live).length;

function liveSay(ids: readonly string[]): string {
  const k = liveCount(ids);
  return k === ids.length
    ? ids.length === 1
      ? 'its page is live'
      : `all ${ids.length} pages are live`
    : `${k} of ${ids.length} pages are live`;
}

const allNodes = NODES.map((n) => n.id);

function mapVars(): Record<string, Scalar> {
  return {
    families: FAMILIES.length,
    patterns: NODES.length,
    cues: CUES.length,
    'live pages': liveCount(allNodes),
  };
}

export const initialVars = (): Record<string, Scalar> => mapVars();

function refuse(s: S, say: string, line: string): PmStep {
  return { state: s, marks: [], say, lines: [line], level: 1 };
}

/** A hint when the text is a problem number or a family's name, typed at the wrong button. */
function otherKind(text: string, here: 'cue' | 'problem'): string {
  const t = norm(text);
  if (here === 'cue' && wholeNumber(t) !== null && findProblem(t) >= 0)
    return ` To read problem ${t}, use Which pattern? instead.`;
  if (FAMILIES.some((f) => norm(f.name) === t)) return ' That is a family: press Show family.';
  return '';
}

// ----- Operations -----

const pick: Op = {
  label: 'Follow cue',
  arity: 1,
  *run(s, [arg], { settings }) {
    const text = String(arg ?? '').trim();
    const q = findCue(text);
    if (!q) {
      yield refuse(
        s,
        `No cue on the map reads “${text}”. Try “the k largest”, “a running median” or “two locks, opposite orders”, or press Show family to see a family’s cues.${otherKind(text, 'cue')}`,
        'pick.sig',
      );
      return s;
    }
    const f = familyOf(q.node);
    const fam = FAMILIES[f]!;
    const n = node(q.node);
    const vars = (hops: number): Record<string, Scalar> => ({
      family: fam.name,
      pattern: hops > 0 ? n.name : '',
      hops,
    });
    let state: S = { ...blank, mode: 'family', family: f, cue: q.id };
    yield {
      state,
      marks: [mark(cueId(q.id), 'active')],
      say: `${quoted(q.text)} is a cue in the ${fam.name} family: ${fam.about}.`,
      lines: ['pick.find'],
      vars: vars(0),
      level: 2,
    } satisfies PmStep;
    state = { ...state, node: q.node };
    yield {
      state,
      marks: [
        mark(cueId(q.id), 'active'),
        mark(arrowId(q.id), 'active'),
        mark(nodeId(q.node), 'active'),
      ],
      say: `It points to ${n.name}. ${q.why}`,
      lines: ['pick.hop'],
      vars: vars(1),
      level: 2,
    } satisfies PmStep;
    state = { ...state, page: true };
    yield {
      state,
      marks: [
        mark(arrowId(q.id), 'found'),
        mark(nodeId(q.node), 'found'),
        mark(pageId(q.node), 'found'),
      ],
      say: `${settings.naive ? `${costSay(q.node)} ` : ''}${pageSay(q.node)}`,
      lines: settings.naive ? ['pick.naive', 'pick.page'] : ['pick.page'],
      vars: vars(2),
      level: 1,
    } satisfies PmStep;
    return state;
  },
};

const family: Op = {
  label: 'Show family',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '').trim();
    const f = findFamily(text);
    if (f < 0) {
      yield refuse(
        s,
        `No family is called “${text}”. Type a number from 1 to ${FAMILIES.length}, a family’s name such as Heap patterns, or one of its cues.`,
        'family.sig',
      );
      return s;
    }
    const fam = FAMILIES[f]!;
    const cues = familyCues(f);
    const vars = (k: number): Record<string, Scalar> => ({
      family: fam.name,
      patterns: `${k} of ${fam.nodes.length}`,
      cues: cues.length,
      'live pages': liveCount(fam.nodes),
    });
    let state: S = { ...blank, mode: 'family', family: f };
    yield {
      state,
      marks: [mark(HEAD, 'active')],
      say: `Family ${f + 1}, ${fam.name}: ${fam.about}. ${fam.nodes.length} ${fam.nodes.length === 1 ? 'pattern' : 'patterns'} and ${cues.length} cues.`,
      lines: ['family.sig'],
      vars: vars(0),
      level: 2,
    } satisfies PmStep;
    for (let k = 0; k < fam.nodes.length; k++) {
      const id = fam.nodes[k]!;
      const own = cuesOf(id);
      state = { ...state, node: id };
      yield {
        state,
        marks: [
          mark(nodeId(id), 'active'),
          ...own.flatMap((q) => [mark(cueId(q.id), 'active'), mark(arrowId(q.id), 'active')]),
        ],
        say: `${node(id).name}: ${list(own.map((q) => quoted(q.text)))}. ${pageSay(id)}`,
        lines: ['family.each', 'family.cues'],
        vars: vars(k + 1),
        level: 2,
      } satisfies PmStep;
    }
    state = { ...state, node: null };
    yield {
      state,
      marks: [mark(HEAD, 'found')],
      say: `That is the ${fam.name} family: ${fam.nodes.length} ${fam.nodes.length === 1 ? 'pattern' : 'patterns'}, and ${liveSay(fam.nodes)}. Follow one of its cues to see why it points where it does.`,
      lines: ['family.done'],
      vars: vars(fam.nodes.length),
      level: 1,
    } satisfies PmStep;
    return state;
  },
};

const which: Op = {
  label: 'Which pattern?',
  arity: 1,
  *run(s, [arg], { settings }) {
    const text = String(arg ?? '').trim();
    const p = findProblem(text);
    if (p < 0) {
      yield refuse(
        s,
        `There is no problem “${text}” here. Type a number from 1 to ${PROBLEMS.length}, or a cue that one of them contains, such as “the k largest”.${otherKind(text, 'problem')}`,
        'which.sig',
      );
      return s;
    }
    const prob = PROBLEMS[p]!;
    const finds = shownFinds(prob, settings);
    const traps = (upTo: number) => finds.slice(0, upTo).filter((f) => f.trap).length;
    const vars = (read: number, hopped: number): Record<string, Scalar> => ({
      problem: p + 1,
      'cues read': read,
      'look-alikes': traps(read),
      hops: hopped,
    });
    let state: S = { ...blank, mode: 'problem', problem: p };
    yield {
      state,
      marks: [mark(PROB, 'active')],
      say: `Problem ${p + 1}, ${prob.title}. Read it for cues: the shape of the data, and what is asked for.`,
      lines: ['which.sig'],
      vars: vars(0, 0),
      level: 2,
    } satisfies PmStep;
    for (let k = 0; k < finds.length; k++) {
      const f = finds[k]!;
      const q = cue(f.cue);
      const w = wordsId(prob.finds.indexOf(f));
      state = { ...state, read: k + 1 };
      yield {
        state,
        marks: [mark(w, 'active'), mark(cueId(q.id), 'active')],
        say: f.trap
          ? `${quoted(f.words)} looks like the cue ${quoted(q.text)}.`
          : `${quoted(f.words)}: that is the cue ${quoted(q.text)}.`,
        lines: ['which.read', 'which.cue'],
        vars: vars(k + 1, k),
        level: 2,
      } satisfies PmStep;
      state = { ...state, hopped: k + 1 };
      const n = node(q.node);
      const role: MarkRole = f.trap ? 'error' : 'active';
      yield {
        state,
        marks: [mark(cueId(q.id), role), mark(arrowId(q.id), role), mark(nodeId(q.node), role)],
        say: f.trap
          ? `That cue points to ${n.name}, but ${f.but}. Rule it out.`
          : `It points to ${n.name}. ${q.why}`,
        lines: f.trap ? ['which.hop', 'which.trap'] : ['which.hop'],
        vars: vars(k + 1, k + 1),
        level: 2,
      } satisfies PmStep;
    }
    const a = node(prob.answer);
    const out = finds.filter((f) => f.trap).map((f) => node(cue(f.cue).node).name);
    const agree = finds.filter((f) => !f.trap).length;
    state = { ...state, node: prob.answer, page: true };
    yield {
      state,
      marks: [mark(nodeId(a.id), 'found'), mark(pageId(a.id), 'found'), mark(VERDICT, 'found')],
      say: `${agree > 1 ? `The cues agree: ${a.name}.` : `So: ${a.name}.`}${out.length ? ` ${list(out)} is ruled out.` : ''} ${settings.naive ? `${costSay(a.id)} ` : ''}${pageSay(a.id)}`,
      lines: settings.naive ? ['which.answer', 'which.naive'] : ['which.answer'],
      vars: vars(finds.length, finds.length),
      level: 1,
    } satisfies PmStep;
    return state;
  },
};

const map: Op = {
  label: 'Whole map',
  arity: 0,
  *run() {
    for (let f = 0; f < FAMILIES.length; f++) {
      const fam = FAMILIES[f]!;
      const names = fam.nodes.map((id) => node(id).name);
      yield {
        state: { ...blank, family: f },
        marks: [mark(famId(f), 'active')],
        say: `${f + 1}. ${fam.name}: ${fam.about}. ${list(names)}.`,
        lines: ['map.each', 'map.count'],
        vars: mapVars(),
        level: 2,
      } satisfies PmStep;
    }
    yield {
      state: blank,
      marks: [],
      say: `${FAMILIES.length} families, ${NODES.length} patterns and ${CUES.length} cues; ${liveSay(allNodes)}. Show a family to see its cues, or press Which pattern? to read a problem for them.`,
      lines: ['map.done'],
      vars: mapVars(),
      level: 1,
    } satisfies PmStep;
    return blank;
  },
};

export const ops = { pick, family, which, map };

// ----- Pseudocode, narration, description -----

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PmSettings): PseudoBlock[] {
  return [
    {
      op: 'pick',
      lines: [
        L('pick.sig', 0, 'follow(cue)', 'To follow a cue:'),
        L(
          'pick.find',
          1,
          'F ← the family that lists cue',
          'find the cue on the map, in its family;',
        ),
        L('pick.hop', 1, 'p ← pattern[cue]', 'follow its arrow to the pattern it calls for;'),
        ...(settings.naive
          ? [
              L(
                'pick.naive',
                1,
                'say naive(p), cost(p)',
                'say what the naive way costs, and what the pattern costs;',
              ),
            ]
          : []),
        L('pick.page', 1, 'return page[p]', 'the pattern’s page is where to practise it.'),
      ],
    },
    {
      op: 'family',
      lines: [
        L('family.sig', 0, 'show(F)', 'To show a family:'),
        L('family.each', 1, 'for each pattern p in F', 'take its patterns one at a time,'),
        L(
          'family.cues',
          2,
          'draw cue → p for each cue of p, and page[p]',
          'and draw the cues that point to it, and its page.',
        ),
        L('family.done', 1, 'return F', 'Then the whole family is on the map.'),
      ],
    },
    {
      op: 'which',
      lines: [
        L('which.sig', 0, 'which(statement)', 'To find the pattern a problem calls for:'),
        L(
          'which.read',
          1,
          'for each phrase w in statement that is a cue',
          'read it, and stop at each phrase that is a cue;',
        ),
        L('which.cue', 2, 'c ← the cue w is', 'say which cue it is,'),
        L('which.hop', 2, 'p ← pattern[c]', 'and follow it to its pattern.'),
        ...(settings.lookalikes
          ? [
              L(
                'which.trap',
                2,
                'if p does not fit the statement: rule p out',
                'A look-alike points elsewhere: say why it does not fit, and drop it.',
              ),
            ]
          : []),
        L(
          'which.answer',
          1,
          'return the p the cues agree on, and page[p]',
          'The pattern the cues agree on is the answer.',
        ),
        ...(settings.naive
          ? [L('which.naive', 1, 'say naive(p), cost(p)', 'Say what the naive way would cost.')]
          : []),
      ],
    },
    {
      op: 'map',
      lines: [
        L('map.sig', 0, 'map()', 'To show the whole map:'),
        L('map.each', 1, 'for each family F', 'take the families one at a time,'),
        L('map.count', 2, 'count its patterns and live pages', 'and name their patterns.'),
        L('map.done', 1, 'return the families', 'Then every family is in view.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return `${FAMILIES.length} families of patterns, with ${CUES.length} cues that point to them. Type a cue such as “the k largest” and press Follow cue, or press Which pattern? with a problem from 1 to ${PROBLEMS.length}.`;
}

/** Screen-reader summary. */
export function describe(state: S, settings: PmSettings): string {
  if (state.mode === 'overview') {
    const fams = FAMILIES.map((f) => `${f.name}, ${f.nodes.length}`).join('; ');
    return `The pattern map: ${FAMILIES.length} families, with how many patterns each: ${fams}.`;
  }
  if (state.mode === 'family') {
    const fam = FAMILIES[state.family]!;
    const rows = fam.nodes
      .map((id) => {
        const cues = cuesOf(id)
          .map((q) => q.text)
          .join(', ');
        return `${node(id).name} (${live(id) ? `/${node(id).page}/` : 'page not live yet'}): ${cues}`;
      })
      .join('; ');
    const focus = state.cue ? ` Following ${quoted(cue(state.cue).text)}.` : '';
    return `${fam.name}: ${rows}.${focus}`;
  }
  const prob = PROBLEMS[state.problem]!;
  const finds = shownFinds(prob, settings).slice(0, state.read);
  const read = finds.length
    ? ` Cues read: ${finds.map((f) => `${quoted(f.words)} is ${quoted(cue(f.cue).text)}${f.trap ? ', a look-alike' : ''}`).join('; ')}.`
    : '';
  const answer = state.page && state.node ? ` Answer: ${node(state.node).name}.` : '';
  return `Problem ${state.problem + 1}: ${prob.text}${read}${answer}`;
}

/** The input box takes any text: a cue, a family, or a problem's number. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  return t ? t : new Error('Type a cue, a family or a problem number first.');
}
