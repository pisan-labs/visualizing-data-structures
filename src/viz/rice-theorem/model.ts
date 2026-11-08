/**
 * Rice's theorem, by the reduction from the halting problem, on the toy programs of the
 * halting-problem page (they read their input and never write; a cycle check decides whether
 * one halts, which is exactly what no real decider could do for Turing machines).
 *
 *   build i j   M′ from M = Mi and w = ⟨Mj⟩: on input x, run M on w; if it halts, run M_P on x
 *   test x      run M′ on x: phase 1 (M on w), then phase 2 (M_P on x)
 *   decide      the argument: a decider R for P would answer "does M halt on w?"
 *
 * Setting `property`: the semantic property P. ∅ never has it, and M_P is a program whose
 * language does, so L(M′) is L(M_P) (has P) when M halts on w, and ∅ (lacks P) when it loops.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import {
  MAX_SIZE,
  PROGRAMS,
  SYMBOLS,
  cell,
  halts,
  parseCode,
  runProgram,
  type Instr,
  type Outcome,
} from '../halting-problem/toy';

export type PropId = 'accepts-A' | 'accepts-eps' | 'nonempty';

export interface RiceSettings {
  [key: string]: Scalar;
  property: PropId;
}

export interface Prop {
  id: PropId;
  /** "L(M) contains A". */
  text: string;
  short: string;
  /** M_P: a program whose language has the property. */
  code: string;
  what: string;
  has: (accepts: (x: string) => boolean | null) => boolean | null;
}

const program = (code: string): Instr[] => parseCode(code) as Instr[];

export const PROPS: Record<PropId, Prop> = {
  'accepts-A': {
    id: 'accepts-A',
    text: 'L(M) contains the word A',
    short: 'A ∈ L(M)',
    code: 'A',
    what: 'accepts every input',
    has: (acc) => acc('A'),
  },
  'accepts-eps': {
    id: 'accepts-eps',
    text: 'L(M) contains the empty word',
    short: 'ε ∈ L(M)',
    code: 'E3RA',
    what: 'accepts only the empty word',
    has: (acc) => acc(''),
  },
  nonempty: {
    id: 'nonempty',
    text: 'L(M) is not empty',
    short: 'L(M) ≠ ∅',
    code: '?A3RA',
    what: 'accepts the words that start with A',
    has: (acc) => acc('A'),
  },
};

/** Properties to tell apart: semantic ones Rice covers, and ones it does not. */
export const KINDS = ['semantic', 'syntactic', 'trivial'] as const;
export type Kind = (typeof KINDS)[number];
export const EXAMPLES: { text: string; kind: Kind; why: string }[] = [
  {
    text: 'L(M) contains the word A',
    kind: 'semantic',
    why: 'it is about the language: two programs with the same language agree on it',
  },
  { text: 'L(M) is empty', kind: 'semantic', why: 'it depends only on which words are accepted' },
  { text: 'L(M) is finite', kind: 'semantic', why: 'it depends only on the language' },
  {
    text: 'L(M) is regular',
    kind: 'semantic',
    why: 'a property of the language, true for some programs and false for others',
  },
  {
    text: 'M accepts every input',
    kind: 'semantic',
    why: 'that is L(M) = everything, a property of the language',
  },
  {
    text: 'M has 5 lines',
    kind: 'syntactic',
    why: 'it is about the code: count the lines and answer',
  },
  { text: 'M contains a goto', kind: 'syntactic', why: 'read the code once: decidable' },
  {
    text: 'M moves its head on input A within 10 steps',
    kind: 'syntactic',
    why: 'run it for 10 steps: a bounded run always finishes',
  },
  {
    text: 'L(M) is recognizable',
    kind: 'trivial',
    why: 'every program’s language is, so the answer is always yes',
  },
  {
    text: 'L(M) is a set of words',
    kind: 'trivial',
    why: 'true for every program: decidable by always saying yes',
  },
];

export interface TestRow {
  x: string;
  /** What M′ does on x. */
  outcome: Outcome;
}

export type Phase = 'idle' | 'built' | 'tested' | 'argued';

export interface RiceState {
  property: PropId;
  /** M = M(m + 1) and w = ⟨M(w + 1)⟩, 0-based; null before Build. */
  m: number | null;
  w: number | null;
  phase: Phase;
  /** The run in progress or last run: which line of M′ and what each phase did. */
  current: {
    x: string;
    line: number;
    first: Outcome | null;
    firstSteps: number;
    second: Outcome | null;
  } | null;
  rows: TestRow[];
  /** Lines of the argument shown. */
  argued: number;
}

type S = RiceState;
type Op = OpSpec<S, RiceSettings, unknown>;
type RStep = Step<S, unknown>;

export const defaults: RiceSettings = { property: 'accepts-A' };
export const MAX_ROWS = 5;
export const MAX_INPUT = 6;

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export const propOf = (s: Pick<S, 'property'>): Prop => PROPS[s.property] ?? PROPS['accepts-A'];
export const M = (i: number) => `M${i + 1}`;
export const desc = (j: number) => `⟨M${j + 1}⟩`;
export const wordText = (x: string) => (x === '' ? 'ε' : x);

export function init(settings: RiceSettings = defaults): S {
  const property: PropId = PROPS[settings.property] ? settings.property : 'accepts-A';
  return { property, m: null, w: null, phase: 'idle', current: null, rows: [], argued: 0 };
}

/** Does M halt on w? (Decidable here only because the toy programs never write.) */
export const haltsOn = (m: number, w: number): boolean => halts(cell(m, w).outcome);

/** What M′ does on x: loop if M loops on w, otherwise what M_P does on x. */
export function mPrimeOn(p: Prop, m: number, w: number, x: string): Outcome {
  if (!haltsOn(m, w)) return 'loop';
  return runProgram(program(p.code), x).outcome;
}

/** Whether M′ has P: it does exactly when M halts on w. */
export function mPrimeHas(p: Prop, m: number, w: number): boolean {
  return !!p.has((x) => mPrimeOn(p, m, w, x) === 'accept');
}

export function vars(s: S): Record<string, Scalar> {
  const out: Record<string, Scalar> = { property: propOf(s).short };
  if (s.m !== null && s.w !== null) {
    out.M = M(s.m);
    out.w = desc(s.w);
    out['inputs tried'] = s.rows.length;
  }
  return out;
}

const outcomeText = (o: Outcome) =>
  o === 'loop' ? 'loops forever' : o === 'unknown' ? 'is still running' : `${o}s`;

export function programIndex(v: Value | undefined): number | null {
  const k =
    typeof v === 'number'
      ? v
      : typeof v === 'string' && /^\s*m?\s*[1-9]\s*$/i.test(v)
        ? Number(v.replace(/\D/g, ''))
        : NaN;
  return Number.isInteger(k) && k >= 1 && k <= MAX_SIZE ? k - 1 : null;
}

export function parseInputWord(v: Value | undefined): string | Error {
  const t = String(v ?? '').trim();
  if (t === 'eps' || t === 'ε' || t === '') return '';
  const bad = [...t].find((c) => !SYMBOLS.includes(c));
  if (bad !== undefined)
    return new Error(
      `"${bad}" is not a symbol the programs read. Use ${SYMBOLS.split('').join(' ')}, or eps.`,
    );
  if (t.length > MAX_INPUT) return new Error(`Keep inputs to ${MAX_INPUT} symbols.`);
  return t;
}

function refuse(s: S, say: string, line: string): RStep {
  return {
    state: s,
    marks: [mark('mp-title', 'error')],
    say,
    lines: [line],
    vars: vars(s),
    level: 1,
  };
}

const build: Op = {
  label: 'Build M′',
  arity: 2,
  *run(s, [a, b]) {
    const m = programIndex(a);
    const w = programIndex(b);
    if (m === null || w === null) {
      yield refuse(
        s,
        `Build takes two program numbers from 1 to ${MAX_SIZE}: M, then the program whose description is w. For example 3 2 builds M′ from M3 and ⟨M2⟩.`,
        'build.sig',
      );
      return s;
    }
    const p = propOf(s);
    const base: S = { ...s, m, w, phase: 'built', current: null, rows: [], argued: 0 };
    yield {
      state: base,
      marks: [mark('mp-1', 'active')],
      say: `Build M′ from M = ${M(m)} (${PROGRAMS[m]!.what}) and w = ${desc(w)} = ${PROGRAMS[w]!.code}. Line 1: on any input x, first run ${M(m)} on ${desc(w)}, ignoring x.`,
      lines: ['build.sig', 'build.run'],
      vars: vars(base),
      level: 2,
    } satisfies RStep;
    yield {
      state: base,
      marks: [mark('mp-2', 'active'), mark('mp-3', 'active')],
      say: `Line 2: if that run halts, run M_P on x. M_P = ${p.code} ${p.what}, so its language has the property ${p.short}. The empty language does not.`,
      lines: ['build.then'],
      vars: vars(base),
      level: 2,
    } satisfies RStep;
    yield {
      state: base,
      marks: [mark('mp-title', 'found')],
      say: `So L(M′) is L(M_P) if ${M(m)} halts on ${desc(w)}, and ∅ if it does not. Building M′ is just writing code: it never runs anything. Try inputs with Test, or press Decide for the argument.`,
      lines: ['build.done'],
      vars: vars(base),
      level: 1,
    } satisfies RStep;
    return base;
  },
};

const test: Op = {
  label: 'Test',
  arity: 1,
  *run(s, [arg]) {
    if (s.m === null || s.w === null) {
      yield refuse(
        s,
        'Build M′ first: type two program numbers, such as 3 2, and press Build M′.',
        'test.sig',
      );
      return s;
    }
    const x = parseInputWord(arg);
    if (x instanceof Error) {
      yield refuse(s, `Nothing tested. ${x.message}`, 'test.sig');
      return s;
    }
    const p = propOf(s);
    const { m, w } = s;
    const first = cell(m, w);
    let state: S = {
      ...s,
      phase: 'tested',
      current: { x, line: 1, first: null, firstSteps: 0, second: null },
    };
    yield {
      state,
      marks: [mark('mp-1', 'active')],
      say: `M′ on x = ${wordText(x)}. Line 1 runs ${M(m)} on ${desc(w)}, whatever x is.`,
      lines: ['test.sig', 'build.run'],
      vars: vars(state),
      level: 2,
    } satisfies RStep;
    state = {
      ...state,
      current: { ...state.current!, first: first.outcome, firstSteps: first.steps },
    };
    if (!halts(first.outcome)) {
      const rows = [...s.rows.filter((r) => r.x !== x), { x, outcome: 'loop' as Outcome }].slice(
        -MAX_ROWS,
      );
      state = { ...state, rows };
      yield {
        state,
        marks: [mark('phase-1', 'error'), mark(`row-${rows.length - 1}`, 'error')],
        say: `${M(m)} loops on ${desc(w)} (it comes back to a configuration it was in), so M′ never gets to line 2: M′ loops on ${wordText(x)}. It will loop on every input: L(M′) = ∅.`,
        lines: ['build.run'],
        vars: vars(state),
        level: 1,
      } satisfies RStep;
      return state;
    }
    yield {
      state: { ...state, current: { ...state.current!, line: 2 } },
      marks: [mark('phase-1', 'found'), mark('mp-2', 'active')],
      say: `${M(m)} ${outcomeText(first.outcome)} on ${desc(w)} after ${first.steps} steps. It halted, which is all that matters: on to line 2.`,
      lines: ['build.then'],
      vars: vars(state),
      level: 2,
    } satisfies RStep;
    const second = mPrimeOn(p, m, w, x);
    const rows = [...s.rows.filter((r) => r.x !== x), { x, outcome: second }].slice(-MAX_ROWS);
    state = { ...state, rows, current: { ...state.current!, line: 2, second } };
    yield {
      state,
      marks: [
        mark('phase-2', second === 'accept' ? 'found' : 'error'),
        mark(`row-${rows.length - 1}`, second === 'accept' ? 'found' : 'error'),
      ],
      say: `M_P ${second === 'loop' ? 'loops on' : `${second}s`} ${wordText(x)}, so M′ does too. While ${M(m)} halts on ${desc(w)}, M′ behaves exactly like M_P.`,
      lines: ['build.then'],
      vars: vars(state),
      level: 1,
    } satisfies RStep;
    return state;
  },
};

export const ARGUMENT = (p: Prop, m: number, w: number): string[] => {
  const h = haltsOn(m, w);
  return [
    `Suppose R decides P: on any ⟨M⟩ it halts and says whether ${p.short}.`,
    `If ${M(m)} halts on ${desc(w)}: L(M′) = L(M_P), which has P.`,
    `If ${M(m)} loops on ${desc(w)}: L(M′) = ∅, which lacks P.`,
    `So R(⟨M′⟩) says yes exactly when ${M(m)} halts on ${desc(w)}. Here: ${h ? 'yes, it halts' : 'no, it loops'}.`,
    'Build M′, ask R: that decides HALT. No machine decides HALT, so no R exists.',
  ];
};

const decide: Op = {
  label: 'Decide',
  arity: 0,
  *run(s) {
    if (s.m === null || s.w === null) {
      yield refuse(
        s,
        'Build M′ first: type two program numbers, such as 3 2, and press Build M′.',
        'decide.r',
      );
      return s;
    }
    const p = propOf(s);
    const lines = ARGUMENT(p, s.m, s.w);
    const ids = ['decide.r', 'decide.halt', 'decide.loop', 'decide.iff', 'decide.contra'];
    let state = s;
    for (let k = 0; k < lines.length; k++) {
      state = { ...state, phase: 'argued', argued: k + 1 };
      const last = k === lines.length - 1;
      yield {
        state,
        marks: [mark(`arg-${k}`, last ? 'found' : 'active')],
        say: last
          ? `${lines[k]} The same argument works for every non-trivial semantic property: that is Rice's theorem.`
          : lines[k]!,
        lines: [ids[k]!],
        vars: vars(state),
        level: last ? 1 : 2,
      } satisfies RStep;
    }
    return state;
  },
};

export const ops = { build, test, decide };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'build',
      lines: [
        L(
          'build.sig',
          0,
          'build(⟨M, w⟩):  M′ = "on input x:',
          'From M and w, write the code of a new program M′, which on input x:',
        ),
        L('build.run', 1, 'run M on w (ignore x)', 'first runs M on w, ignoring its own input;'),
        L(
          'build.then',
          1,
          'if it halts: run M_P on x and do what it does"',
          'then, if that halted, behaves like M_P on x.',
        ),
        L(
          'build.done',
          0,
          'return ⟨M′⟩ (nothing is run)',
          'Return the code. Building runs nothing.',
        ),
      ],
    },
    {
      op: 'test',
      lines: [L('test.sig', 0, 'run M′ on x', 'Run M′ on an input, to see what it does.')],
    },
    {
      op: 'decide',
      lines: [
        L('decide.r', 0, 'suppose R decides P', 'Suppose some program R decides P.'),
        L('decide.halt', 1, 'M halts on w ⇒ L(M′) = L(M_P) ∈ P', 'If M halts on w, M′ has P.'),
        L('decide.loop', 1, 'M loops on w ⇒ L(M′) = ∅ ∉ P', 'If M loops on w, M′ does not.'),
        L('decide.iff', 1, 'R(⟨M′⟩) = yes ⇔ M halts on w', 'So R answers the halting question.'),
        L(
          'decide.contra',
          0,
          'H(⟨M, w⟩) = R(build(⟨M, w⟩)) decides HALT: impossible',
          'That decides HALT, which no program can: R cannot exist.',
        ),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `Rice's theorem: no program decides a non-trivial property of what programs accept. Here P is "${propOf(s).text}". Type two program numbers, such as 3 2, and press Build M′ to build the machine of the proof.`;
}

export function describe(s: S): string {
  const p = propOf(s);
  const head = `Property P: ${p.text}.`;
  if (s.m === null || s.w === null) return `${head} No M′ built yet.`;
  const rows = s.rows.map((r) => `${wordText(r.x)}: ${r.outcome}`).join('; ');
  return `${head} M′ runs ${M(s.m)} on ${desc(s.w)}, then M_P = ${p.code} on its input.${rows ? ` Tested: ${rows}.` : ''}${s.argued ? ` Argument: ${s.argued} of 5 steps.` : ''}`;
}
