/**
 * Mealy and Moore machines: run a word and watch the output appear, and convert either kind
 * into the other (Hopcroft and Ullman, Theorems 2.6 and 2.7).
 *
 * The state is the loaded machine and, once Convert has run, the machine it built. A run's
 * bookkeeping (the word, how much is read, each machine's state and output so far) and a
 * conversion's (the states and moves built so far, notes beside the source's states) travel in
 * the steps' `extra`, so a plain state draws just the machines.
 *
 * Operations
 *   load(text)  a machine in the text format of machine.ts
 *   run(word)   run the loaded machine, and the converted one beside it when there is one
 *   convert()   Moore to Mealy (a move writes what its target writes), or Mealy to Moore (each
 *               state split by the outputs written on the moves into it)
 *   back()      convert the converted machine back again: the round trip
 *
 * Setting `first`: a Moore machine writes its start state's output before reading anything
 * (n + 1 symbols, Hopcroft and Ullman; the default), or only after each move (n symbols).
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import type { Move } from '../_automata/automaton';
import { loadOp, looksLikeMachine, plural, wordText, words } from '../_automata/page';
import { parseWord } from '../_automata/parse';
import {
  convert,
  delta,
  describeFull,
  describeMachine,
  kindName,
  machineKey,
  mealyToMoore,
  moveKey,
  otherKind,
  parseMachine,
  sizeProblem,
  writes,
  type First,
  type Kind,
  type Machine,
} from './machine';
import { MACHINES } from './machines';

export interface MmState {
  machine: Machine;
  /** The machine Convert built from it, once Convert has run. */
  result?: Machine;
}

export interface MmSettings {
  [key: string]: Scalar;
  first: First;
}

export const defaults: MmSettings = { first: 'write' };

/** Shape id prefixes: the loaded machine, and the converted one. */
export const SRC = '';
export const DST = 'c-';

/** The output written inside a Moore state (see draw.ts). */
export const outputId = (q: string, prefix = ''): string => `${stateId(q, prefix)}-o`;

/** One machine during a run. */
export interface Track {
  kind: Kind;
  /** Which drawing it is: SRC or DST. */
  prefix: string;
  q: string;
  /** Written so far. */
  out: string;
  /** The move just followed. */
  last?: Move;
}

export interface RunView {
  word: string;
  read: number;
  /** The Mealy machine first when both run. */
  tracks: Track[];
  done: boolean;
}

export interface ConvView {
  /** States of the new machine built so far, in the order they were made. */
  states: string[];
  /** Its moves built so far, as moveKey(from, symbol). */
  moves: string[];
  start: boolean;
  /** Mealy to Moore: beside each Mealy state done, the outputs it is entered with. */
  notes: Record<string, string>;
}

export interface MmExtra {
  run?: RunView;
  conv?: ConvView;
}

type S = MmState;
type X = MmExtra;
type Op = OpSpec<S, MmSettings, X>;
type MmStep = Step<S, X>;

export const START_TEXT = MACHINES.detect101;

export function init(): S {
  return { machine: parseMachine(START_TEXT) as Machine };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const NONE = '–';
const outText = (o: string) => (o === '' ? 'ε' : o);

export function machineVars(m: Machine): Record<string, Scalar> {
  return {
    machine: kindName(m.kind),
    '|Q|': m.fa.states.length,
    '|Σ|': m.fa.alphabet.length,
    '|Δ|': m.outputs.length,
  };
}

/** Text that is a machine rather than a word: arrows, semicolons, keywords or outputs. */
export const looksLike = (t: string): boolean => looksLikeMachine(t) || t.includes('/');

// ---------------------------------------------------------------------------------------------
// Load

function fail(s: S, say: string, lines: string[]): MmStep {
  return { state: s, marks: [], say, lines, level: 1, vars: machineVars(s.machine) };
}

const load = loadOp<S, MmSettings, X, Machine>({
  parse: parseMachine,
  describe: describeMachine,
  looksLike,
  example: 'q0 a -> q1 / 1',
  words: true,
  check: sizeProblem,
  make: (m) => ({ machine: m }),
  ready: (m) =>
    `Type a word and press Run, or press Convert to build the equivalent ${kindName(otherKind(m.kind))} machine.`,
  vars: (s) => machineVars(s.machine),
});

// ---------------------------------------------------------------------------------------------
// Run

/** Why a word cannot be run on the machine, or null. */
export function wordProblem(raw: string, m: Machine): string | null {
  const t = raw.trim();
  if (looksLike(t)) return 'That looks like a machine: press Load to load it.';
  const w = parseWord(t, m.fa);
  return w instanceof Error ? w.message : null;
}

/** The machines a run uses: the loaded one, and the converted one; the Mealy machine first. */
function runMachines(s: S): { m: Machine; prefix: string }[] {
  const out = [{ m: s.machine, prefix: SRC }];
  if (s.result) out.push({ m: s.result, prefix: DST });
  return out.sort((a, b) => (a.m.kind === b.m.kind ? 0 : a.m.kind === 'mealy' ? -1 : 1));
}

function runVars(r: RunView | null): Record<string, Scalar> {
  if (!r) return { state: NONE, symbol: NONE, read: 0, output: NONE };
  const symbol = r.read > 0 && !r.done ? r.word[r.read - 1]! : NONE;
  const read = `${r.read} of ${r.word.length}`;
  if (r.tracks.length === 1) {
    const t = r.tracks[0]!;
    return { state: t.q, symbol, read, output: outText(t.out) };
  }
  const out: Record<string, Scalar> = { symbol, read };
  for (const t of r.tracks) {
    out[kindName(t.kind)] = t.q;
    out[`${kindName(t.kind)} out`] = outText(t.out);
  }
  return out;
}

/** "goes to q1" or "stays in q1". */
const goes = (from: string, to: string) => (from === to ? `stays in ${to}` : `goes to ${to}`);

function startSay(tracks: Track[], word: string, first: First): string {
  const w = wordText(word);
  const empty = word === '' ? ' There is nothing to read: the word is ε.' : '';
  const mealy = tracks.find((t) => t.kind === 'mealy');
  const moore = tracks.find((t) => t.kind === 'moore');
  const mooreStart = (t: Track) =>
    first === 'write'
      ? `writes its output, ${t.out}, before reading anything`
      : 'writes nothing yet: with this setting a Moore machine writes only after a move';
  if (mealy && moore)
    return `Run both machines on ${w}. The Mealy machine starts in ${mealy.q} and writes nothing yet. The Moore machine starts in ${moore.q} and ${mooreStart(moore)}.${empty}`;
  if (mealy)
    return `Run the Mealy machine on ${w}. Start in ${mealy.q}. It writes nothing yet: a Mealy machine writes only as it moves.${empty}`;
  return `Run the Moore machine on ${w}. Start in ${moore!.q}, which ${mooreStart(moore!)}.${empty}`;
}

function moveSay(tracks: Track[], c: string, outs: string[]): string {
  if (tracks.length === 1) {
    const t = tracks[0]!;
    const o = outs[0]!;
    const { from, to } = t.last!;
    if (t.kind === 'mealy')
      return `Read ${c}: the move from ${from} on ${c} writes ${o} and ${goes(from, to)}.`;
    return from === to
      ? `Read ${c}: stay in ${to} and write its output again, ${o}.`
      : `Read ${c}: move to ${to} and write its output, ${o}.`;
  }
  const [a, b] = tracks as [Track, Track];
  const mealy = `${a.last!.from} on ${c} writes ${outs[0]} and ${goes(a.last!.from, a.last!.to)}`;
  const moore =
    b.last!.from === b.last!.to
      ? `${b.last!.to} stays put and writes ${outs[1]} again`
      : `${b.last!.from} goes to ${b.last!.to}, which writes ${outs[1]}`;
  return `Read ${c}. Mealy: ${mealy}. Moore: ${moore}.`;
}

function endSay(tracks: Track[], word: string, first: First): string {
  const n = word.length;
  const used = n ? 'The input is used up' : 'The word is ε, so nothing is read';
  if (tracks.length === 1) {
    const t = tracks[0]!;
    const what = `${kindName(t.kind)} machine wrote ${outText(t.out)}`;
    if (t.kind === 'mealy')
      return n
        ? `${used}, and the ${what}: ${plural(n, 'symbol')}, one per input symbol.`
        : `${used}, and the Mealy machine writes nothing: it writes only as it moves.`;
    if (first === 'write')
      return `${used}, and the ${what}: ${plural(n + 1, 'symbol')}, one more than the input, because the start state wrote first.`;
    return `${used}, and the ${what}: ${plural(n, 'symbol')}, one for each state it entered.`;
  }
  const [a, b] = [tracks[0]!.out, tracks[1]!.out];
  const head = `${used}. Mealy wrote ${outText(a)} and Moore wrote ${outText(b)}.`;
  if (first === 'write')
    return b.slice(1) === a
      ? n
        ? `${head} Drop the Moore machine's first symbol, written before any input, and the rest is the Mealy output: the same output, one step later.`
        : `${head} The Moore machine's one symbol is its start state's output, written before any input.`
      : `${head} Dropping the Moore machine's first symbol leaves ${outText(b.slice(1))}, which is not the Mealy output.`;
  return a === b
    ? `${head} The same symbols. Each Moore symbol comes from the state after the move, so in a circuit it shows up one clock tick after the Mealy one.`
    : `${head} They differ.`;
}

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [arg], { settings }) {
    const raw = String(arg ?? '');
    const problem = wordProblem(raw, s.machine);
    if (problem) {
      yield { ...fail(s, `Nothing to run. ${problem}`, ['run.sig']), vars: runVars(null) };
      return s;
    }
    const word = parseWord(raw.trim(), s.machine.fa) as string;
    const first = settings.first;
    const ms = runMachines(s);
    const tracks: Track[] = ms.map(({ m, prefix }) => ({
      kind: m.kind,
      prefix,
      q: m.fa.start,
      out: m.kind === 'moore' && first === 'write' ? writes(m, m.fa.start) : '',
    }));
    const snap = (read: number, done: boolean): RunView => ({
      word,
      read,
      tracks: tracks.map((t) => ({ ...t, last: t.last && { ...t.last } })),
      done,
    });
    const step = (
      say: string,
      lines: string[],
      level: 1 | 2,
      marks: Mark[],
      read: number,
      done = false,
    ): MmStep => {
      const r = snap(read, done);
      return { state: s, marks, say, lines, level, vars: runVars(r), extra: { run: r } };
    };
    const anyMoore = tracks.some((t) => t.kind === 'moore');
    const anyMealy = tracks.some((t) => t.kind === 'mealy');
    yield step(
      startSay(tracks, word, first),
      ['run.start', ...(anyMoore && first === 'write' ? ['run.first'] : [])],
      2,
      tracks.flatMap((t) => [
        mark(stateId(t.q, t.prefix), 'active'),
        mark(`${t.prefix}start`, 'active'),
        ...(t.kind === 'moore' && first === 'write' ? [mark(outputId(t.q, t.prefix), 'new')] : []),
      ]),
      0,
    );
    for (let i = 0; i < word.length; i++) {
      const c = word[i]!;
      const outs: string[] = [];
      const marks: Mark[] = [];
      ms.forEach(({ m }, k) => {
        const t = tracks[k]!;
        const from = t.q;
        const to = delta(m, from, c);
        const o = m.kind === 'mealy' ? writes(m, from, c) : writes(m, to);
        t.q = to;
        t.last = { from, on: c, to };
        t.out += o;
        outs.push(o);
        marks.push(
          mark(stateId(to, t.prefix), 'active'),
          mark(moveId(from, to, t.prefix), 'active'),
          ...(m.kind === 'moore' ? [mark(outputId(to, t.prefix), 'new')] : []),
        );
      });
      yield step(
        moveSay(tracks, c, outs),
        [
          'run.for',
          ...(anyMealy ? ['run.mealy'] : []),
          'run.move',
          ...(anyMoore ? ['run.moore'] : []),
        ],
        2,
        marks,
        i + 1,
      );
    }
    yield step(
      endSay(tracks, word, first),
      ['run.for'],
      1,
      tracks.map((t) => mark(stateId(t.q, t.prefix), 'active')),
      word.length,
      true,
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// Convert

function convVars(m: Machine, c: ConvView, total: Machine): Record<string, Scalar> {
  const out: Record<string, Scalar> = { from: kindName(m.kind), '|Q|': m.fa.states.length };
  if (m.kind === 'mealy') {
    out['|Δ|'] = m.outputs.length;
    out['Moore states'] = c.states.length;
    out['at most'] = m.fa.states.length * m.outputs.length;
  }
  out.moves = `${c.moves.length} of ${total.fa.moves.length}`;
  return out;
}

/** "q0 on 1 and q2 on 1". */
const fromList = (ms: Move[]) => words(ms.map((mv) => `${mv.from} on ${mv.on}`));

/**
 * The steps of a conversion, ending with { machine: m, result }. `end` adds a sentence to the
 * last step (Convert back compares the result with where the round trip started).
 */
function* convertSteps(
  m: Machine,
  first: First,
  end: (result: Machine) => string = () => '',
): Generator<MmStep, S, void> {
  const result = convert(m);
  const c: ConvView = { states: [], moves: [], start: false, notes: {} };
  const s: S = { machine: m };
  const step = (say: string, lines: string[], level: 1 | 2, marks: Mark[], state = s): MmStep => ({
    state,
    marks,
    say,
    lines,
    level,
    vars: convVars(m, c, result),
    extra: { conv: { ...c, states: [...c.states], moves: [...c.moves], notes: { ...c.notes } } },
  });
  const n = m.fa.states.length;
  const start = m.fa.start;

  if (m.kind === 'moore') {
    c.states = [...result.fa.states];
    c.start = true;
    yield step(
      `Moore to Mealy. A Mealy machine writes on its moves, so give each move the output of the state it enters. The ${plural(n, 'state')} stay as they are, and ${start} is still the start.`,
      ['conv.sig', 'conv.moore'],
      2,
      result.fa.states.map((q) => mark(stateId(q, DST), 'new')),
    );
    for (const mv of m.fa.moves) {
      const o = writes(m, mv.to);
      c.moves.push(moveKey(mv.from, mv.on));
      yield step(
        `${mv.from} on ${mv.on} goes to ${mv.to}, which writes ${o}. So in the Mealy machine this move writes ${o}: ${mv.on}/${o}.`,
        ['conv.move', 'conv.write'],
        2,
        [
          mark(moveId(mv.from, mv.to, SRC), 'active'),
          mark(outputId(mv.to, SRC), 'found'),
          mark(moveId(mv.from, mv.to, DST), 'new'),
        ],
      );
    }
    const gone =
      first === 'write'
        ? `${start}'s own output, ${writes(m, start)}, is gone: a Mealy machine writes only when it moves, so on every word it writes one symbol fewer than the Moore machine: it leaves out that first one.`
        : `With this setting the Moore machine never writes ${start}'s output before a move either, so the two write the same symbols on every word.`;
    const tail = end(result);
    yield step(
      `Done: a Mealy machine with the same ${plural(n, 'state')} and ${plural(result.fa.moves.length, 'move')}. ${gone}${tail ? ` ${tail}` : ''}`,
      ['conv.move'],
      1,
      [],
      { machine: m, result },
    );
    return { machine: m, result };
  }

  const split = mealyToMoore(m);
  const d = m.outputs.length;
  yield step(
    'Mealy to Moore. A Moore state writes one output, but the moves into a Mealy state can write different things. So take each state in turn, and make one Moore state for each output written on the moves into it.',
    ['conv.sig', 'conv.mealy'],
    2,
    [],
  );
  for (const q of m.fa.states) {
    const ins = split.entered[q]!;
    const copies = split.copies[q]!;
    const into = m.fa.moves.filter((mv) => mv.to === q);
    const outOf = (mv: Move) => writes(m, mv.from, mv.on);
    let say: string;
    if (!ins.length)
      say = `No move enters ${q}, so nothing says what it should write. It still needs a Moore state: ${q}, writing ${split.machine.out[q]}, the first output symbol.`;
    else if (ins.length === 1)
      say = `${into.length === 1 ? 'The only move' : 'Every move'} into ${q} writes ${ins[0]} (${fromList(into)}). So ${q} needs one Moore state: ${q}, writing ${ins[0]}.`;
    else {
      const by = ins.map((o) => `${o} (${fromList(into.filter((mv) => outOf(mv) === o))})`);
      const named = copies.map((p, i) => `${p} writes ${ins[i]}`);
      say = `The moves into ${q} write ${words(by)}. One Moore state writes only one output, so ${q} splits into ${copies.length}: ${words(named)}.`;
    }
    if (q === start)
      say +=
        copies.length > 1
          ? ` The start can be any copy of ${q}, because what it writes comes out before any input. Take the first, ${copies[0]}.`
          : ` ${copies[0]} is the Moore machine's start state.`;
    c.states.push(...copies);
    c.notes[q] = `in: ${ins.length ? ins.join(',') : 'none'}`;
    if (q === start) c.start = true;
    const arrows = [...new Set(into.map((mv) => moveId(mv.from, q, SRC)))];
    yield step(
      say,
      ['conv.state', 'conv.entered', 'conv.copy', ...(q === start ? ['conv.start'] : [])],
      2,
      [
        mark(stateId(q, SRC), 'active'),
        ...arrows.map((id) => mark(id, 'active')),
        ...copies.map((p) => mark(stateId(p, DST), 'new')),
        ...(q === start ? [mark(`${DST}start`, 'new')] : []),
      ],
    );
  }
  for (const p of split.order) {
    const q = split.of[p]!;
    for (const sym of m.fa.alphabet) {
      const to = delta(m, q, sym);
      const o = writes(m, q, sym);
      const target = delta(split.machine, p, sym);
      const many = split.copies[to]!.length > 1;
      const where = many
        ? `${target}, the copy of ${to} that writes ${o}`
        : `${target}, which writes ${o}`;
      const say =
        p === q
          ? `${p} on ${sym}: the Mealy machine goes to ${to} and writes ${o}, so the Moore machine goes to ${where}.`
          : `${p} is a copy of ${q}, so it moves like ${q}. On ${sym}, ${q} goes to ${to} writing ${o}, so ${p} goes to ${where}.`;
      c.moves.push(moveKey(p, sym));
      yield step(say, ['conv.each', 'conv.delta'], 2, [
        mark(stateId(p, DST), 'active'),
        mark(moveId(q, to, SRC), 'active'),
        mark(moveId(p, target, DST), 'new'),
        ...(target === p ? [] : [mark(stateId(target, DST), 'found')]),
      ]);
    }
  }
  const k = result.fa.states.length;
  const splitStates = m.fa.states.filter((q) => split.copies[q]!.length > 1);
  const why = splitStates.length
    ? `: ${words(splitStates)} ${splitStates.length === 1 ? 'is' : 'are'} entered with different outputs, so ${splitStates.length === 1 ? 'it splits' : 'they split'}`
    : ', the same number: each state is entered with one output only';
  const tail = end(result);
  yield step(
    `Done: a Moore machine with ${plural(k, 'state')} for the Mealy machine's ${n}${why}. It never needs more than |Q|·|Δ| = ${n}·${d} = ${n * d}.${tail ? ` ${tail}` : ''}`,
    ['conv.out'],
    1,
    splitStates.flatMap((q) => split.copies[q]!.map((p) => mark(stateId(p, DST), 'found'))),
    { machine: m, result },
  );
  return { machine: m, result };
}

const convertOp: Op = {
  label: 'Convert',
  arity: 0,
  *run(s, _args, { settings }) {
    return yield* convertSteps(s.machine, settings.first);
  },
};

/** How the end of a round trip compares with where it started. */
function roundTrip(orig: Machine, res: Machine, first: First): string {
  if (machineKey(orig) === machineKey(res))
    return 'The round trip gives back exactly the machine you started with.';
  const n0 = orig.fa.states.length;
  const k = res.fa.states.length;
  if (k > n0)
    return `The machine you started with had ${plural(n0, 'state')}; this one has ${k}. It writes the same on every word, but the copies the split made stay apart: converting does not minimize.`;
  const changed = res.fa.states.filter((q) => res.kind === 'moore' && orig.out[q] !== res.out[q]);
  if (changed.length && orig.kind === 'moore')
    return `It matches the machine you started with, except that ${words(changed.map((q) => `${q} writes ${res.out[q]} instead of ${orig.out[q]}`))}. No move enters ${changed.length === 1 ? 'it' : 'them'}, so the Mealy machine kept no record of ${changed.length === 1 ? 'its output' : 'their outputs'}${first === 'write' && changed.includes(res.fa.start) ? ', and the start state’s output is only ever the first symbol' : ''}.`;
  return 'It writes the same as the machine you started with on every word, but it is not quite the same machine.';
}

const back: Op = {
  label: 'Convert back',
  arity: 0,
  *run(s, _args, { settings }) {
    if (!s.result) {
      yield fail(
        s,
        'Nothing to convert back yet. Press Convert first; Convert back then turns its result into the other kind again.',
        ['back.sig'],
      );
      return s;
    }
    const orig = s.machine;
    const m = s.result;
    yield {
      state: { machine: m },
      marks: [],
      say: `Convert back: the ${kindName(m.kind)} machine just built becomes the machine to convert, and the ${kindName(orig.kind)} machine it came from is set aside.`,
      lines: ['back.sig', 'back.swap'],
      level: 2,
      vars: machineVars(m),
    };
    return yield* convertSteps(m, settings.first, (res) => roundTrip(orig, res, settings.first));
  },
};

export const ops = { load, run, convert: convertOp, back };

// ---------------------------------------------------------------------------------------------
// Pseudocode: Hopcroft and Ullman's definitions, with the conversions as their proofs build them.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

function convertLines(indent: number) {
  const i = indent;
  return [
    L('conv.sig', i, 'CONVERT(M)', 'To convert a machine M:'),
    L('conv.moore', i + 1, 'if M is a Moore machine', 'If M writes on its states (Moore),'),
    L('conv.move', i + 2, 'for each move δ(p, c) = q', 'for each move from p to q on c,'),
    L('conv.write', i + 3, "λ'(p, c) = λ(q)", 'the move writes what q writes.'),
    L('conv.mealy', i + 1, 'else', 'If M writes on its moves (Mealy):'),
    L('conv.state', i + 2, 'for each state q', 'for each state q,'),
    L('conv.entered', i + 3, 'O = {λ(p, c) : δ(p, c) = q}', 'collect what the moves into q write;'),
    L(
      'conv.copy',
      i + 3,
      'add a copy [q, o] for each o ∈ O',
      'make one copy of q for each output.',
    ),
    L('conv.start', i + 2, "q0' = a copy of q0", 'Start in a copy of q0.'),
    L('conv.each', i + 2, 'for each copy [q, o] and c ∈ Σ', 'For each copy and each symbol,'),
    L(
      'conv.delta',
      i + 3,
      "δ'([q, o], c) = [δ(q, c), λ(q, c)]",
      'go where q goes, to the copy that writes what that move writes.',
    ),
    L('conv.out', i + 2, "λ'([q, o]) = o", 'Each copy writes its own output.'),
  ];
}

export function pseudocode(settings: MmSettings): PseudoBlock[] {
  const write = settings.first === 'write';
  return [
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'RUN(M, w)', 'To run a machine M on a word w:'),
        L('run.start', 1, 'q = q0', 'Start in the start state.'),
        ...(write
          ? [
              L(
                'run.first',
                1,
                'if M is Moore: write λ(q)',
                'A Moore machine writes its output now.',
              ),
            ]
          : []),
        L('run.for', 1, 'for each symbol c of w', 'Read w one symbol at a time:'),
        L(
          'run.mealy',
          2,
          'if M is Mealy: write λ(q, c)',
          'a Mealy machine writes what the move writes,',
        ),
        L('run.move', 2, 'q = δ(q, c)', 'follow the move,'),
        L(
          'run.moore',
          2,
          'if M is Moore: write λ(q)',
          'and a Moore machine writes what the new state writes.',
        ),
      ],
    },
    { op: 'convert', lines: convertLines(0) },
    {
      op: 'back',
      lines: [
        L('back.sig', 0, "BACK(M, M')", 'To convert the result back:'),
        L('back.swap', 1, "M = M'", 'the machine just built is the one to convert;'),
        ...convertLines(1),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'This Mealy machine writes 1 each time the input so far ends in 101. Type a word such as 110101 and press Run, or press Convert to build a Moore machine that does the same.';
}

export const initialVars = (s: S): Record<string, Scalar> => machineVars(s.machine);

export function describe(s: S): string {
  return `${describeFull(s.machine)}${s.result ? ` Converted: ${describeFull(s.result)}` : ''}`;
}

/** The run, for screen readers. */
export function describeRun(r: RunView): string {
  const outs = r.tracks
    .map((t) => `the ${kindName(t.kind)} machine is in ${t.q} and has written ${outText(t.out)}`)
    .join('; ');
  return `Run on ${wordText(r.word)}: ${r.read} of ${r.word.length} symbols read; ${outs}.`;
}

/** The conversion so far, for screen readers. */
export function describeConv(m: Machine, c: ConvView): string {
  const res = convert(m);
  const states = c.states.map((q) => (res.kind === 'moore' ? `${q} writes ${res.out[q]}` : q));
  return `The ${kindName(res.kind)} machine so far: ${states.length ? words(states) : 'no states yet'}; ${plural(c.moves.length, 'move')} of ${res.fa.moves.length}.${
    Object.keys(c.notes).length
      ? ` Entered with: ${Object.entries(c.notes)
          .map(([q, n]) => `${q} ${n.replace('in: ', '')}`)
          .join(', ')}.`
      : ''
  }`;
}
