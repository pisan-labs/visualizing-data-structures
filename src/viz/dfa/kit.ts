/**
 * What the DFA and NFA pages share: the state, the input field, the `load` operation, batches of
 * words to test, the driver lines for the code tabs, and the drawing around the state diagram
 * (the input tape, the accept or reject badge, the test table, and the choice of drawing the
 * diagram across or down). It lives in the DFA folder until it moves into src/viz/_automata.
 *
 * Both pages use the same operation names, so compare mode can run a DFA and an NFA side by
 * side: `load` (machine text), `run` (a word) and `test` (a batch such as "+ab -ba -eps").
 *
 * API
 *   FaState                      { machine }
 *   parseFaInput(text)           the input field: machine text, a word or a batch
 *   parseBatch(text, a)          "+ab aab -eps" -> [{ word, expect }], or an Error
 *   faLoadOp(o)                  the `load` operation
 *   whyNotDfa(a)                 why a machine is not deterministic, or null
 *   machineLines(a)              driver input for a machine (see the code tabs)
 *   faScene(a, opts, stage, ...) the diagram across or down, with a block of panels placed
 *   drawInputTape, drawVerdict, drawTestTable   the panels
 */
import type { Rng } from '../../engine/rng';
import type {
  Controls,
  MarkRole,
  OpSpec,
  Scalar,
  Settings,
  StageSize,
  Step,
  Value,
} from '../../engine/types';
import { drawAutomaton, layoutStates, type DrawOptions } from '../../layouts/automaton';
import {
  below,
  fitScore,
  padBounds,
  placePanels,
  textWidth,
  unionBounds,
} from '../../layouts/graph';
import { CELL_W, drawTape, tapeWindow } from '../../layouts/tape';
import type { Bounds, Shape } from '../../render/scene';
import { listWords } from '../_graph/graph';
import {
  EPS,
  describeAutomaton,
  makeAutomaton,
  targets,
  type Automaton,
  type Move,
} from '../_automata/automaton';
import { MAX_WORD, formatAutomaton, parseAutomaton, parseWord } from '../_automata/parse';

export interface FaState {
  machine: Automaton;
}

export type Verdict = 'accept' | 'reject';

/** Words per batch, so the table stays readable on a phone. */
export const MAX_BATCH = 8;
export const MAX_INPUT = 300;
/** Tape cells shown at most; a longer word scrolls under the head. */
export const TAPE_CELLS = 12;

export const wordText = (w: string): string => (w === '' ? 'ε' : w);
/** "{q0, q1}" for narration, "∅" for the empty set. */
export const setText = (set: readonly string[]): string =>
  set.length ? `{${set.join(', ')}}` : '∅';
/** "{q0,q1}" for panels. */
export const setShort = (set: readonly string[]): string =>
  set.length ? `{${set.join(',')}}` : '∅';
export const plural = (n: number, word: string, many = `${word}s`): string =>
  `${n} ${n === 1 ? word : many}`;

// ---------------------------------------------------------------------------------------------
// Input

const MACHINE_HINT = /->|→|;/;
const KEYWORD = /^(start|accept|final|states)\s/i;
const TOKEN = /^[+-]?(?:[A-Za-z0-9]+|eps|ε)$/;

/** The input field takes machine text, a word, or a batch of words with + or - in front. */
export function parseFaInput(raw: string): Value | Error {
  const t = raw.trim();
  if (!t)
    return new Error(
      'Type a word such as 0101, words to test such as +01 -10, or a machine such as "q0 0 -> q1; accept q1".',
    );
  if (MACHINE_HINT.test(t) || KEYWORD.test(t)) {
    const a = parseAutomaton(t);
    return a instanceof Error ? a : t;
  }
  for (const tok of t.split(/[\s,]+/).filter(Boolean))
    if (!TOKEN.test(tok))
      return new Error(
        `"${tok}" is not a word. Use letters and digits, or ε (eps) for the empty word; put + or - in front to test it.`,
      );
  return t;
}

export function faInput(sample: string): NonNullable<Controls['input']> {
  return {
    label: 'Machine or word',
    placeholder: 'e.g. 0101, +01 -10, or q0 0 -> q1; accept q1',
    maxLength: MAX_INPUT,
    sample,
    parse: parseFaInput,
  };
}

export const looksLikeMachine = (t: string): boolean => MACHINE_HINT.test(t) || KEYWORD.test(t);

/** Why a word cannot be run: a sentence, with a hint when the text was meant for another button. */
export function wordProblem(raw: string, a: Automaton): string | null {
  const t = raw.trim();
  if (looksLikeMachine(t)) return 'That looks like a machine: press Load to load it.';
  if (/^[+-]/.test(t))
    return `"${t}" has a + or - in front, which marks a word to test. Press Test to check it against what it should give, or type just the word to run it.`;
  const w = parseWord(t, a);
  return w instanceof Error ? w.message : null;
}

export interface BatchItem {
  word: string;
  /** What the machine should do: + accept, - reject, or null when no sign was given. */
  expect: Verdict | null;
}

export function parseBatch(raw: string, a: Automaton): BatchItem[] | Error {
  const t = raw.trim();
  if (looksLikeMachine(t)) return new Error('That looks like a machine: press Load to load it.');
  const tokens = t.split(/[\s,]+/).filter(Boolean);
  if (!tokens.length)
    return new Error(
      'Type words to test, such as +01 -10 -eps: + for a word the machine should accept and - for one it should reject.',
    );
  if (tokens.length > MAX_BATCH) return new Error(`Test at most ${MAX_BATCH} words at a time.`);
  const out: BatchItem[] = [];
  for (const tok of tokens) {
    const sign = tok[0] === '+' || tok[0] === '-' ? tok[0] : '';
    const body = tok.slice(sign.length);
    if (!body)
      return new Error(`"${tok}" has no word after the sign. Write -eps for the empty word.`);
    const w = parseWord(body, a);
    if (w instanceof Error) return new Error(`In "${tok}": ${w.message}`);
    out.push({ word: w, expect: sign === '+' ? 'accept' : sign === '-' ? 'reject' : null });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Loading a machine

/** Why a machine is not a DFA, or null when it is one. */
export function whyNotDfa(a: Automaton): string | null {
  const eps = a.moves.find((m) => m.on === EPS);
  if (eps)
    return `${eps.from} has an ε-move to ${eps.to}, and a DFA reads exactly one symbol per move`;
  for (const m of a.moves) {
    const ts = targets(a, m.from, m.on);
    if (ts.length > 1)
      return `${m.from} has ${ts.length} moves on ${m.on} (to ${listWords(ts)}), and a DFA has at most one`;
  }
  return null;
}

export interface FaLoadOptions {
  /** A sentence saying why this machine cannot be loaded here, or null. */
  check?(a: Automaton): string | null;
  /** What to say after a good load. */
  ready(a: Automaton): string;
  vars(a: Automaton): Record<string, Scalar>;
}

/** The `load` operation of the DFA and NFA pages. */
export function faLoadOp<Set extends Settings, X>(o: FaLoadOptions): OpSpec<FaState, Set, X> {
  return {
    label: 'Load',
    arity: 1,
    *run(s, [arg]) {
      const text = String(arg ?? '').trim();
      const a = parseAutomaton(text);
      const problem =
        a instanceof Error
          ? looksLikeMachine(text) || !text
            ? a.message
            : `"${text}" is not a machine. Type moves such as "q0 a -> q1; accept q1"; to run a word, press Run.`
          : o.check?.(a);
      if (problem || a instanceof Error) {
        yield {
          state: s,
          marks: [],
          say: `Nothing loaded. ${problem} The machine stays as it was.`,
          lines: [],
          level: 1,
          vars: o.vars(s.machine),
        } satisfies Step<FaState, X>;
        return s;
      }
      const next: FaState = { machine: a };
      yield {
        state: next,
        marks: [],
        say: `Loaded: ${describeAutomaton(a)} ${o.ready(a)}`,
        lines: [],
        level: 1,
        vars: o.vars(a),
      } satisfies Step<FaState, X>;
      return next;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Code tabs

/**
 * Driver lines for a machine: "machine <start> <states in name order>" starts a new machine
 * with no accept states and no moves, "accept <states>" names the accept states, and
 * "move <from> <symbol> <to>" adds a move ("eps" for an ε-move). None of them prints.
 */
export function machineLines(a: Automaton): string[] {
  return [
    `machine ${a.start} ${a.states.join(' ')}`,
    ...(a.accept.length ? [`accept ${a.accept.join(' ')}`] : []),
    ...a.moves.map((m) => `move ${m.from} ${m.on === EPS ? 'eps' : m.on} ${m.to}`),
  ];
}

export const loadCall = (a: Automaton): ['load', string] => ['load', formatAutomaton(a)];

// ---------------------------------------------------------------------------------------------
// Drawing

const BADGE_H = 30;
const GAP = 14;

export interface TapeView {
  word: string;
  /** Symbols read so far (greyed). */
  read: number;
  /** The head's cell, or null for none. */
  head: number | null;
  headLabel?: string;
  /** Reserve room for a word this long, so the block keeps its size through a batch. */
  room: number;
  roles: ReadonlyMap<string, MarkRole>;
}

/** Cells the tape shows for a word of this length: the word and one cell past its end. */
export const tapeCells = (n: number): number => Math.min(n + 1, TAPE_CELLS);

/**
 * The input as a tape: the word, then one empty cell where the head stops when the input runs
 * out. A word longer than the tape scrolls in half-tape steps.
 */
export function drawInputTape(out: Shape[], x: number, y: number, t: TapeView): Bounds {
  const n = t.word.length;
  const width = tapeCells(n);
  const win = n + 1 <= TAPE_CELLS ? { from: 0, to: n + 1 } : tapeWindow(t.head ?? n, TAPE_CELLS, 0);
  const b = drawTape(out, {
    x,
    y,
    cells: [...t.word],
    from: win.from,
    to: Math.min(win.to, n + 1),
    head: t.head,
    headLabel: t.headLabel,
    read: t.read,
    roles: new Map(t.roles),
    blank: ' ',
  });
  // Keep the head on the tape through a run (at the end, on the empty cell): the cells sit
  // under it, so they would jump up if it went away.
  return { x, y, w: Math.max(b.w, tapeCells(t.room) * CELL_W, width * CELL_W), h: b.h };
}

export const verdictId = 'verdict';

/** The accept or reject badge, with its room kept when there is no verdict yet. */
export function drawVerdict(
  out: Shape[],
  x: number,
  y: number,
  verdict: Verdict | undefined,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const w = 96;
  if (verdict) {
    const role = roles.get(verdictId) ?? (verdict === 'accept' ? 'found' : 'error');
    out.push({ kind: 'rect', id: verdictId, x, y, w, h: BADGE_H, r: 15, cls: 'live', role });
    out.push({
      kind: 'text',
      id: `${verdictId}-t`,
      x: x + w / 2,
      y: y + BADGE_H / 2 + 6,
      text: verdict === 'accept' ? '✓ accept' : '✗ reject',
      size: 16,
      anchor: 'middle',
      weight: 'bold',
      role,
    });
  }
  return { x, y, w, h: BADGE_H };
}

export interface TestRow {
  word: string;
  expect: Verdict | null;
  /** What the machine did, once the row has been run. */
  got?: Verdict;
}

export interface FaTest {
  rows: TestRow[];
  /** The row being run, or -1 before the first and rows.length after the last. */
  at: number;
}

export const testRowId = (i: number): string => `test-${i}`;
export const rowOk = (r: TestRow): boolean | null =>
  r.got === undefined || r.expect === null ? null : r.got === r.expect;

const TEST_SIZE = 14;
const ROW_H = 24;

/** The batch: one row per word, with what it should give and what it gave. */
export function drawTestTable(
  out: Shape[],
  x: number,
  y: number,
  t: FaTest,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const wordW =
    Math.max(
      textWidth('word', 13),
      ...t.rows.map((r) => textWidth(wordText(r.word), TEST_SIZE, true)),
    ) + 16;
  const verdictW = textWidth('expected', 13) + 14;
  const okW = 30;
  const cols = [
    { key: 'w', head: 'word', x, w: wordW },
    { key: 'e', head: 'expected', x: x + wordW + 4, w: verdictW },
    { key: 'g', head: 'got', x: x + wordW + verdictW + 8, w: verdictW },
    { key: 'ok', head: '', x: x + wordW + 2 * verdictW + 12, w: okW },
  ];
  const right = x + wordW + 2 * verdictW + 12 + okW;
  for (const c of cols)
    if (c.head)
      out.push({
        kind: 'text',
        id: `test-h-${c.key}`,
        x: c.x + 6,
        y: y + 15,
        text: c.head,
        size: 13,
        cls: 'label',
      });
  t.rows.forEach((r, i) => {
    const ry = y + 22 + i * (ROW_H + 4);
    const id = testRowId(i);
    const ok = rowOk(r);
    const role =
      roles.get(id) ?? (i === t.at ? 'active' : ok === false ? 'error' : ok ? 'found' : undefined);
    out.push({ kind: 'rect', id, x, y: ry, w: right - x, h: ROW_H, r: 4, cls: 'live', role });
    const textRole = role === 'error' || role === 'active' ? role : undefined;
    const cell = (key: string, text: string, mono = true) =>
      out.push({
        kind: 'text',
        id: `${id}-${key}`,
        x: cols.find((c) => c.key === key)!.x + 6,
        y: ry + ROW_H / 2 + 5,
        text,
        size: TEST_SIZE,
        mono,
        role: textRole,
        weight: key === 'w' ? 'bold' : undefined,
      });
    cell('w', wordText(r.word));
    cell('e', r.expect ?? '?');
    cell('g', r.got ?? '');
    cell('ok', ok === null ? '' : ok ? '✓' : '✗', false);
  });
  return { x, y, w: right - x, h: 22 + t.rows.length * (ROW_H + 4) - 4 };
}

/** A block of panels stacked top to bottom, each drawn at (x, y) and returning its box. */
export function stack(
  parts: ((out: Shape[], x: number, y: number) => Bounds)[],
): (out: Shape[], x: number, y: number) => Bounds {
  return (out, x, y) => {
    const boxes: Bounds[] = [];
    let at = y;
    for (const p of parts) {
      const b = p(out, x, at);
      boxes.push(b);
      at = below(b, GAP);
    }
    return unionBounds(...boxes);
  };
}

/** The height a tape and a badge take together, for the nominal block. */
export const RUN_BLOCK_H = 46 + 36 + GAP + BADGE_H;

/**
 * The state diagram, with a block of panels under it or beside it. The diagram runs across
 * (layers left to right) or down (top to bottom), whichever draws larger on the stage once a
 * block of the `nominal` size is placed, so the direction depends only on the machine and the
 * screen and stays put while runs come and go. With no stage (tests, thumbnails, practice
 * pictures) it runs across. The block itself goes wherever placePanels finds room.
 */
export function faScene(
  a: Automaton,
  opts: DrawOptions,
  stage: StageSize | undefined,
  nominal: { w: number; h: number },
  block?: (out: Shape[], x: number, y: number) => Bounds,
): { shapes: Shape[]; bounds: Bounds } {
  const across = !stage || acrossFits(a, stage, nominal);
  const d = drawAutomaton(a, layoutStates(a, across), opts);
  const shapes = [...d.shapes];
  const boxes = [d.bounds];
  if (block) boxes.push(placePanels(shapes, d.bounds, stage, block));
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14) };
}

const acrossCache = new Map<string, boolean>();

function acrossFits(a: Automaton, stage: StageSize, nominal: { w: number; h: number }): boolean {
  const key = `${stage.w}x${stage.h}|${nominal.w}x${nominal.h}|${formatAutomaton(a)}`;
  const hit = acrossCache.get(key);
  if (hit !== undefined) return hit;
  const score = (across: boolean) => {
    const d = drawAutomaton(a, layoutStates(a, across));
    const b = placePanels([], d.bounds, stage, (_out, x, y) => ({ x, y, ...nominal }));
    return fitScore(padBounds(unionBounds(d.bounds, b), 14), stage);
  };
  const out = score(true) >= score(false);
  if (acrossCache.size > 300) acrossCache.clear();
  acrossCache.set(key, out);
  return out;
}

export { MAX_WORD };

/** A sentence about a batch, for screen readers. */
export function describeTest(t: FaTest): string {
  const rows = t.rows.map((r) => {
    const want = r.expect ? `should ${r.expect}` : 'no expectation';
    const got = r.got ? `, ${r.got}ed${rowOk(r) === false ? ', a mismatch' : ''}` : '';
    return `${wordText(r.word)} (${want}${got})`;
  });
  return `Test of ${plural(t.rows.length, 'word')}: ${rows.join('; ')}.`;
}

// ---------------------------------------------------------------------------------------------
// Random machines and words (presets and practice)

/** A word of length n over the alphabet. */
export function randomWord(rng: Rng, alphabet: readonly string[], n: number): string {
  return Array.from({ length: n }, () => alphabet[rng.int(0, alphabet.length - 1)]!).join('');
}

const names = (n: number) => Array.from({ length: n }, (_, i) => `q${i}`);

function pickAccept(rng: Rng, states: string[]): string[] {
  const out = states.filter(() => rng.int(0, 2) === 0);
  return out.length ? out : [states[rng.int(1, states.length - 1)] ?? states[0]!];
}

/**
 * A DFA with n states over the alphabet, every state reachable from q0 (each new state is
 * reached from an earlier one first). With `partial`, about a quarter of the other moves are
 * left out.
 */
export function randomDfa(
  rng: Rng,
  n: number,
  { alphabet = ['a', 'b'], partial = false }: { alphabet?: string[]; partial?: boolean } = {},
): Automaton {
  const qs = names(n);
  const delta = new Map<string, string>();
  for (let i = 1; i < n; i++) {
    for (;;) {
      const p = qs[rng.int(0, i - 1)]!;
      const c = alphabet[rng.int(0, alphabet.length - 1)]!;
      if (!delta.has(`${p} ${c}`)) {
        delta.set(`${p} ${c}`, qs[i]!);
        break;
      }
    }
  }
  for (const p of qs)
    for (const c of alphabet)
      if (!delta.has(`${p} ${c}`) && !(partial && rng.int(0, 3) === 0))
        delta.set(`${p} ${c}`, qs[rng.int(0, n - 1)]!);
  // Every symbol on some move: the machine's text names its alphabet only through its moves.
  for (const c of alphabet)
    if (![...delta.keys()].some((k) => k.endsWith(` ${c}`)))
      delta.set(`${qs[rng.int(0, n - 1)]} ${c}`, qs[rng.int(0, n - 1)]!);
  return makeAutomaton({
    states: qs,
    alphabet,
    start: 'q0',
    accept: pickAccept(rng, qs),
    moves: [...delta].map(([k, to]) => {
      const [from, on] = k.split(' ') as [string, string];
      return { from, on, to };
    }),
  });
}

/**
 * An NFA with n states over the alphabet: every state reachable from q0, about 1.8 moves per
 * state, so some states have two moves on one symbol and some none, and with `eps` a few
 * ε-moves.
 */
export function randomNfa(
  rng: Rng,
  n: number,
  { alphabet = ['a', 'b'], eps = true }: { alphabet?: string[]; eps?: boolean } = {},
): Automaton {
  const qs = names(n);
  const moves: Move[] = [];
  const sym = () => alphabet[rng.int(0, alphabet.length - 1)]!;
  for (let i = 1; i < n; i++)
    moves.push({
      from: qs[rng.int(0, i - 1)]!,
      on: eps && rng.int(0, 4) === 0 ? EPS : sym(),
      to: qs[i]!,
    });
  const more = Math.round(n * 0.8);
  for (let k = 0; k < more; k++)
    moves.push({
      from: qs[rng.int(0, n - 1)]!,
      on: eps && rng.int(0, 5) === 0 ? EPS : sym(),
      to: qs[rng.int(0, n - 1)]!,
    });
  return makeAutomaton({
    states: qs,
    alphabet,
    start: 'q0',
    accept: pickAccept(rng, qs),
    moves: moves.filter((m) => !(m.on === EPS && m.from === m.to)),
  });
}
