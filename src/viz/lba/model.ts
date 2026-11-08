/**
 * A linear-bounded automaton: a Turing machine whose tape is exactly its input, between the end
 * markers ⊢ and ⊣. It may read the markers but never overwrite them or move past them, so it
 * can use only the n cells it was given (Kuroda's definition, as in Hopcroft and Ullman).
 *
 *   run w    run the chosen machine on ⊢w⊣, a step per move
 *
 * Machines (setting `machine`): aⁿbⁿcⁿ by crossing off one a, b and c per pass; a^(2^k) by
 * halving the a's each pass (Sipser's M2, kept inside the markers); and a doubling machine that
 * needs room after the input, to show the bound stopping it.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
} from '../../engine/types';

export const LEFT = '⊢';
export const RIGHT = '⊣';
export const ACCEPT = 'accept';
export const REJECT = 'reject';
export type MachineId = 'anbncn' | 'power2' | 'double';
export type Move = 'L' | 'R';

export interface LbaSettings {
  [key: string]: Scalar;
  machine: MachineId;
}

export interface LbaRule {
  from: string;
  read: string;
  to: string;
  write: string;
  move: Move;
}

export interface MachineDef {
  id: MachineId;
  name: string;
  /** What it decides, for narration. */
  language: string;
  alphabet: string[];
  states: string[];
  /** Tape symbols the rules use, besides the markers. */
  symbols: string[];
  rules: LbaRule[];
  /** A word in the language, for samples. */
  sample: string;
}

const rule = (
  from: string,
  reads: string,
  to: string,
  write: string | null,
  move: Move,
): LbaRule[] => [...reads].map((read) => ({ from, read, to, write: write ?? read, move }));

export const MACHINES: Record<MachineId, MachineDef> = {
  anbncn: {
    id: 'anbncn',
    name: 'aⁿbⁿcⁿ',
    language: 'aⁿbⁿcⁿ (n ≥ 0)',
    alphabet: ['a', 'b', 'c'],
    states: ['q0', 'q1', 'q2', 'q3', 'q4', 'q5'],
    symbols: ['a', 'b', 'c', 'x', 'y', 'z'],
    rules: [
      ...rule('q0', 'a', 'q1', 'x', 'R'),
      ...rule('q0', 'y', 'q4', null, 'R'),
      ...rule('q0', RIGHT, ACCEPT, null, 'L'),
      ...rule('q1', 'ay', 'q1', null, 'R'),
      ...rule('q1', 'b', 'q2', 'y', 'R'),
      ...rule('q2', 'bz', 'q2', null, 'R'),
      ...rule('q2', 'c', 'q3', 'z', 'L'),
      ...rule('q3', 'abyz', 'q3', null, 'L'),
      ...rule('q3', 'x', 'q0', null, 'R'),
      ...rule('q4', 'y', 'q4', null, 'R'),
      ...rule('q4', 'z', 'q5', null, 'R'),
      ...rule('q5', 'z', 'q5', null, 'R'),
      ...rule('q5', RIGHT, ACCEPT, null, 'L'),
    ],
    sample: 'aabbcc',
  },
  power2: {
    id: 'power2',
    name: 'a^(2^k)',
    language: 'a^(2^k): a, aa, aaaa, aaaaaaaa, …',
    alphabet: ['a'],
    states: ['q1', 'q2', 'q3', 'q4', 'q5'],
    symbols: ['a', 'x', 'y'],
    rules: [
      ...rule('q1', 'a', 'q2', 'y', 'R'),
      ...rule('q2', 'x', 'q2', null, 'R'),
      ...rule('q2', 'a', 'q3', 'x', 'R'),
      ...rule('q2', RIGHT, ACCEPT, null, 'L'),
      ...rule('q3', 'x', 'q3', null, 'R'),
      ...rule('q3', 'a', 'q4', null, 'R'),
      ...rule('q3', RIGHT, 'q5', null, 'L'),
      ...rule('q4', 'x', 'q4', null, 'R'),
      ...rule('q4', 'a', 'q3', 'x', 'R'),
      ...rule('q5', 'ax', 'q5', null, 'L'),
      ...rule('q5', 'y', 'q2', null, 'R'),
    ],
    sample: 'aaaa',
  },
  double: {
    id: 'double',
    name: 'doubling',
    language: 'a copy of each a written after the input',
    alphabet: ['a'],
    states: ['q0', 'q1'],
    symbols: ['a', 'x', 'b'],
    rules: [
      ...rule('q0', 'a', 'q1', 'x', 'R'),
      ...rule('q0', RIGHT, ACCEPT, null, 'L'),
      ...rule('q1', 'ax', 'q1', null, 'R'),
      ...rule('q1', RIGHT, 'q1', null, 'R'),
    ],
    sample: 'aa',
  },
};

export type Verdict = 'accept' | 'reject' | 'blocked' | null;

export interface LbaState {
  machine: MachineId;
  word: string | null;
  /** The whole tape, markers included: ⊢ w ⊣. */
  tape: string[];
  head: number;
  q: string;
  moves: number;
  verdict: Verdict;
  /** Cells the head has visited, as a range. */
  lo: number;
  hi: number;
}

export interface LbaExtra {
  rule?: LbaRule;
  /** The move that would leave the bounds. */
  wall?: 'left' | 'right';
}

type S = LbaState;
type X = LbaExtra;
type Op = OpSpec<S, LbaSettings, X>;
type LStep = Step<S, X>;

export const defaults: LbaSettings = { machine: 'anbncn' };
export const MAX_WORD = 10;
export const CAP = 1000;

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const machineOf = (s: Pick<S, 'machine'>): MachineDef =>
  MACHINES[s.machine] ?? MACHINES.anbncn;
export const startState = (m: MachineDef) => m.states[0]!;
export const ruleFor = (m: MachineDef, q: string, a: string) =>
  m.rules.find((r) => r.from === q && r.read === a);

/** Shape ids: the tape cell k (0 is ⊢), the rule cells, the hierarchy chips. */
export const cellId = (k: number) => `tape-${k}`;
export const ruleId = (q: string, a: string) => `rule-${q}-${a}`;

export function init(settings: LbaSettings = defaults): S {
  const machine: MachineId = MACHINES[settings.machine] ? settings.machine : 'anbncn';
  return {
    machine,
    word: null,
    tape: [LEFT, RIGHT],
    head: 1,
    q: startState(MACHINES[machine]),
    moves: 0,
    verdict: null,
    lo: 1,
    hi: 1,
  };
}

/** How many configurations the machine can be in on a word of length n: |Q| · (n + 2) · |Γ|ⁿ. */
export function configurations(m: MachineDef, n: number): number {
  return m.states.length * (n + 2) * m.symbols.length ** n;
}

const big = (x: number) => (x < 1e6 ? String(x) : x.toExponential(1).replace('e+', '×10^'));

export function vars(s: S): Record<string, Scalar> {
  const m = machineOf(s);
  if (s.word === null) return { states: m.states.length, 'tape symbols': m.symbols.length + 2 };
  const n = s.word.length;
  return {
    state: s.q,
    head: s.head,
    moves: s.moves,
    'cells (n + 2)': n + 2,
    'configurations possible': big(configurations(m, n)),
  };
}

const sym = (a: string) =>
  a === LEFT ? '⊢ (the left marker)' : a === RIGHT ? '⊣ (the right marker)' : a;

function refuse(s: S, say: string): LStep {
  return {
    state: s,
    marks: [mark('status', 'error')],
    say,
    lines: ['run.load'],
    vars: vars(s),
    level: 1,
  };
}

export function parseInputWord(m: MachineDef, text: string): string | Error {
  const t = text.trim();
  if (t === 'eps' || t === 'ε' || t === '') return '';
  const w = [...t].filter((c) => !/\s/.test(c));
  const bad = w.find((c) => !m.alphabet.includes(c));
  if (bad !== undefined)
    return new Error(
      `"${bad}" is not an input symbol of the ${m.name} machine. Its alphabet is ${m.alphabet.join(' ')}.`,
    );
  if (w.length > MAX_WORD) return new Error(`Keep words to ${MAX_WORD} symbols.`);
  return w.join('');
}

/** The run, move by move (for the steps, the tests and the code tabs). */
export function* moves(
  m: MachineDef,
  w: string,
): Generator<{ state: S; rule?: LbaRule; wall?: 'left' | 'right'; stuck?: boolean }, S, void> {
  let s: S = {
    machine: m.id,
    word: w,
    tape: [LEFT, ...w, RIGHT],
    head: 1,
    q: startState(m),
    moves: 0,
    verdict: null,
    lo: 1,
    hi: 1,
  };
  for (;;) {
    if (s.moves >= CAP) {
      s = { ...s, verdict: 'reject' };
      yield { state: s, stuck: true };
      return s;
    }
    const a = s.tape[s.head]!;
    const r = ruleFor(m, s.q, a);
    if (!r) {
      s = { ...s, verdict: 'reject' };
      yield { state: s, stuck: true };
      return s;
    }
    const wall =
      (a === LEFT && r.move === 'L') || (s.head === 0 && r.move === 'L')
        ? 'left'
        : a === RIGHT && r.move === 'R'
          ? 'right'
          : undefined;
    if (wall || ((a === LEFT || a === RIGHT) && r.write !== a)) {
      s = { ...s, verdict: 'blocked' };
      yield { state: s, rule: r, wall: wall ?? (a === LEFT ? 'left' : 'right') };
      return s;
    }
    const tape = [...s.tape];
    tape[s.head] = r.write;
    const head = s.head + (r.move === 'R' ? 1 : -1);
    const halted = r.to === ACCEPT || r.to === REJECT;
    s = {
      ...s,
      tape,
      head,
      q: r.to,
      moves: s.moves + 1,
      lo: Math.min(s.lo, head),
      hi: Math.max(s.hi, head),
      verdict: halted ? (r.to === ACCEPT ? 'accept' : 'reject') : null,
    };
    yield { state: s, rule: r };
    if (halted) return s;
  }
}

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s0, [arg]) {
    const m = machineOf(s0);
    const w = parseInputWord(m, String(arg ?? ''));
    if (w instanceof Error) {
      yield refuse(s0, `Nothing run. ${w.message}`);
      return s0;
    }
    const n = w.length;
    let state: S = {
      machine: m.id,
      word: w,
      tape: [LEFT, ...w, RIGHT],
      head: 1,
      q: startState(m),
      moves: 0,
      verdict: null,
      lo: 1,
      hi: 1,
    };
    yield {
      state,
      marks: [
        mark(cellId(0), 'compare'),
        mark(cellId(n + 1), 'compare'),
        mark('tape-head', 'active'),
      ],
      say: `Write ⊢${w}⊣: the input between the end markers, ${plural(n + 2, 'cell')} in all, and no more. The head starts on cell 1 in ${state.q}. It may read the markers but never move past them.`,
      lines: ['run.load'],
      vars: vars(state),
      level: 2,
    } satisfies LStep;
    for (const mv of moves(m, w)) {
      const prev = state;
      state = mv.state;
      if (mv.stuck) {
        const a = prev.tape[prev.head]!;
        const capped = prev.moves >= CAP;
        yield {
          state,
          marks: [mark('status', 'error'), mark('tape-head', 'error')],
          say: capped
            ? `Still running after ${CAP} moves. An LBA has only so many configurations, so a run this long must repeat one: it loops, and we can say so.`
            : `${prev.q} reads ${sym(a)} and there is no rule for that: reject ${w || 'ε'} after ${plural(prev.moves, 'move')}.`,
          lines: ['run.none'],
          vars: vars(state),
          level: 1,
        } satisfies LStep;
        continue;
      }
      const r = mv.rule!;
      if (mv.wall) {
        yield {
          state,
          marks: [
            mark(mv.wall === 'left' ? cellId(0) : cellId(n + 1), 'error'),
            mark(ruleId(r.from, r.read), 'error'),
            mark('status', 'error'),
          ],
          say: `${r.from} reads ${sym(r.read)} and its rule says move ${r.move === 'R' ? 'right' : 'left'}, past the marker, to write where there is no tape. An LBA may not: the bound stops the machine. A Turing machine would go on and use more than n cells.`,
          lines: ['run.read', 'run.bound'],
          vars: vars(state),
          level: 1,
          extra: { rule: r, wall: mv.wall },
        } satisfies LStep;
        continue;
      }
      const wrote = r.write !== r.read ? `write ${r.write}, ` : '';
      const where = `move ${r.move === 'R' ? 'right' : 'left'}`;
      const changed = prev.q !== r.to;
      const say = state.verdict
        ? `${r.from} reads ${sym(r.read)}: ${state.verdict === 'accept' ? 'accept' : 'reject'} ${w || 'ε'} after ${plural(state.moves, 'move')}, never having left the ${n + 2} cells.`
        : `${r.from} reads ${sym(r.read)}: ${wrote}${where}${changed ? `, and go to ${r.to}` : ''}.`;
      yield {
        state,
        marks: [
          mark(
            ruleId(r.from, r.read),
            state.verdict ? (state.verdict === 'accept' ? 'found' : 'error') : 'active',
          ),
          ...(state.verdict
            ? [mark('status', state.verdict === 'accept' ? 'found' : 'error')]
            : [mark(cellId(prev.head), r.write !== r.read ? 'new' : 'visit')]),
        ],
        say,
        lines: state.verdict ? ['run.read', 'run.halt'] : ['run.read', 'run.move'],
        vars: vars(state),
        level: state.verdict ? 1 : changed ? 2 : 3,
        extra: { rule: r },
      } satisfies LStep;
    }
    return state;
  },
};

export const ops = { run };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'run',
      lines: [
        L(
          'run.load',
          0,
          'tape = ⊢ w ⊣; head = 1; q = q₀',
          'Put the input between the end markers; start on its first symbol.',
        ),
        L(
          'run.read',
          1,
          'repeat: a = tape[head]; (q′, b, D) = δ(q, a)',
          'Read the symbol under the head and look up the rule.',
        ),
        L(
          'run.bound',
          2,
          'if a = ⊢ and D = L, or a = ⊣ and D = R: stop (out of bounds)',
          'The head may never leave the markers.',
        ),
        L('run.move', 2, 'tape[head] = b; head = head ± 1; q = q′', 'Write, move, change state.'),
        L('run.none', 2, 'if there is no rule: reject', 'No rule means reject.'),
        L('run.halt', 1, 'until q is accept or reject', 'Stop in accept or reject.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  const m = machineOf(s);
  return `A linear-bounded automaton for ${m.language}: a Turing machine that may use only the cells its input is written on. Type a word such as ${m.sample} and press Run. Options has two other machines.`;
}

export function describe(s: S): string {
  const m = machineOf(s);
  if (s.word === null) return `The ${m.name} LBA, waiting for a word.`;
  const tape = s.tape.join(' ');
  const v =
    s.verdict === 'accept'
      ? ' Accepted.'
      : s.verdict === 'reject'
        ? ' Rejected.'
        : s.verdict === 'blocked'
          ? ' Stopped at the bound.'
          : '';
  return `The ${m.name} LBA on ${s.word || 'ε'}: tape ${tape}, head on cell ${s.head}, state ${s.q}, ${s.moves} moves.${v}`;
}
