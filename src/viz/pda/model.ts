/**
 * A pushdown automaton, run by a breadth-first search over its configurations (state, input
 * left, stack), with Sipser's conventions: the stack starts empty and the machine accepts by
 * final state. The search tries every move that fits each configuration, oldest first, skips
 * configurations it has seen, accepts at the first configuration that has read the whole word
 * and accepts, rejects when every branch has died, and gives up after CAP configurations.
 *
 * Settings
 *   accept  by final state (Sipser, default) or by empty stack (Hopcroft and Ullman)
 *   search  'all' shows the search one move at a time, every branch alive and the branches
 *           that die, then plays back the accepting computation; 'path' shows only the
 *           computation (the accepting one, or the branch that got furthest)
 *
 * The state is the machine; a run's picture travels in the steps' `extra`, so a plain state
 * (after Load, or in a practice picture) draws the bare machine. Operations: load, run, test.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import { setText } from '../_automata/automaton';
import { MAX_BATCH, plural, wordText, words, type Verdict } from '../_automata/page';
import { rowOk, testRowId, verdictId, type TestRow, type TestTable } from '../_automata/panels';
import {
  CAP,
  branched,
  configText,
  describeMove,
  furthest,
  isDeterministicPda,
  levels,
  makePda,
  moveLabel,
  parsePda,
  parsePdaWord,
  pathTo,
  search,
  whyNotDeterministic,
  type AcceptBy,
  type Config,
  type Pda,
  type PdaMove,
  type Search,
  type SearchNode,
} from '../_automata/pda';
import { MACHINES } from './machines';

export interface PdaSettings {
  [key: string]: Scalar;
  accept: AcceptBy;
  search: 'all' | 'path';
}

export const defaults: PdaSettings = { accept: 'state', search: 'all' };

export interface PdaState {
  machine: Pda;
}

/** What a run ends with: 'stopped' when the search gave up at the cap. */
export type PdaVerdict = Verdict | 'stopped';

/** One line of the configuration panel; `n` is the search node, which names its shapes. */
export interface ShowLine {
  n: number;
  /** Moves from the start. */
  index: number;
  config: Config;
}

/** The room a run's panels keep from its first step to its last, so nothing jumps. */
export interface Frame {
  /** The longest word, for the tape. */
  room: number;
  /** Stack cells drawn. */
  rows: number;
  /** Characters in the longest configuration line. */
  chars: number;
}

/** What one step of a run shows. */
export interface PdaShow {
  word: string;
  /** The configuration the tape and the stack column follow. */
  focus: Config;
  /** Its moves from the start. */
  moves: number;
  /** Symbols just pushed onto the focus's stack, drawn green. */
  pushed: number;
  /** States of the configurations alive now (blue), and of branches that just died (dashed). */
  live: string[];
  dead: string[];
  lines: ShowLine[];
  /** Configurations alive now that the panel has no room for. */
  more: number;
  /** Configurations the search has made so far. */
  explored: number;
  verdict?: PdaVerdict;
  frame: Frame;
}

export interface PdaExtra {
  run?: PdaShow;
  test?: TestTable;
  frame?: Frame;
}

type S = PdaState;
type X = PdaExtra;
type Op = OpSpec<S, PdaSettings, X>;
type PdaStep = Step<S, X>;

/** Lines the configuration panel shows at most. */
export const KEEP = 7;
/** Stack cells drawn at most; a deeper stack shows "+k" for the cells below. */
export const STACK_ROWS = 8;
/**
 * In "every branch", the moves shown one by one before the rest of a long search is summed up:
 * a few when the search ends at the cap (it repeats itself), more when it ends by itself.
 */
export const MAX_LEVELS = { stopped: 8, other: 40 };
/** Moves of a computation played back at normal detail; the rest are fine detail. */
export const PLAY_MAX = 24;
const MAX_CHARS = 40;

export const START_TEXT = MACHINES.anbn;
export const START_MACHINE = parsePda(START_TEXT) as Pda;

export function init(): S {
  return { machine: makePda(START_MACHINE) };
}

export const moveLineId = (i: number): string => `mv-${i}`;
export const lineId = (n: number): string => `cfg-${n}`;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const NONE = '–';

// ---------------------------------------------------------------------------------------------
// Input

const KEYWORD = /^(start|accept|final|states|stack|alphabet)\s/i;
const TOKEN = /^[+-]?(?:[A-Za-z0-9()[\]]+|eps|ε)$/;

export const looksLikePda = (t: string): boolean => /->|→|;/.test(t) || KEYWORD.test(t.trim());

/** The input box: machine text, a word to run, or words with + or - in front to test. */
export function parseInput(raw: string): Value | Error {
  const t = raw.trim();
  if (!t)
    return new Error(
      'Type a word such as aabb, words to test such as +ab -ba, or a machine such as "q0 a, eps -> q0 a; accept q0".',
    );
  if (looksLikePda(t)) {
    const p = parsePda(t);
    return p instanceof Error ? p : t;
  }
  for (const tok of t.split(/[\s,]+/).filter(Boolean))
    if (!TOKEN.test(tok))
      return new Error(
        `"${tok}" is not a word. Use letters, digits and brackets, or ε (eps) for the empty word; put + or - in front to test it.`,
      );
  return t;
}

/** Why a word cannot be run, with a hint when the text was meant for another button. */
export function wordProblem(raw: string, p: Pda): string | null {
  const t = raw.trim();
  if (looksLikePda(t)) return 'That looks like a machine: press Load to load it.';
  if (/^[+-]/.test(t))
    return `"${t}" has a + or - in front, which marks a word to test. Press Test to check it against what it should give, or type just the word to run it.`;
  const w = parsePdaWord(t, p);
  return w instanceof Error ? w.message : null;
}

export interface BatchItem {
  word: string;
  expect: Verdict | null;
}

export function parseBatch(raw: string, p: Pda): BatchItem[] | Error {
  const t = raw.trim();
  if (looksLikePda(t)) return new Error('That looks like a machine: press Load to load it.');
  const tokens = t.split(/[\s,]+/).filter(Boolean);
  if (!tokens.length)
    return new Error(
      'Type words to test, such as +ab -ba -eps: + for a word the machine should accept and - for one it should reject.',
    );
  if (tokens.length > MAX_BATCH) return new Error(`Test at most ${MAX_BATCH} words at a time.`);
  const out: BatchItem[] = [];
  for (const tok of tokens) {
    const sign = tok[0] === '+' || tok[0] === '-' ? tok[0] : '';
    const body = tok.slice(sign.length);
    if (!body)
      return new Error(`"${tok}" has no word after the sign. Write -eps for the empty word.`);
    const w = parsePdaWord(body, p);
    if (w instanceof Error) return new Error(`In "${tok}": ${w.message}`);
    out.push({ word: w, expect: sign === '+' ? 'accept' : sign === '-' ? 'reject' : null });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Words about machines and configurations

const stackWords = (initial: string) => (initial ? `${initial} on the stack` : 'an empty stack');

/** "a deterministic PDA with 4 states, input {a, b} and stack symbols {$, a}: ..." */
export function describePda(p: Pda): string {
  const det = isDeterministicPda(p);
  const acc = p.accept.length ? `accept ${words(p.accept)}` : 'no accept states';
  const why = whyNotDeterministic(p);
  return `a ${det ? 'deterministic' : 'nondeterministic'} PDA with ${plural(p.states.length, 'state')}, input ${setText(p.inputs)} and stack symbols ${setText(p.stackSymbols)}: start ${p.start}, ${acc}, ${stackWords(p.initial)} at the start, and ${plural(p.moves.length, 'move')}.${why ? ` It is nondeterministic because ${why}.` : ''}`;
}

const goTo = (m: PdaMove) => (m.to === m.from ? `, staying in ${m.to}` : `, and go to ${m.to}`);

/** "in q1, read a and push a, staying in q1" */
const moveSay = (m: PdaMove) => `in ${m.from}, ${describeMove(m)}${goTo(m)}`;

/** Why a configuration has no move: "q1 has no move that reads b with $ on top". */
function stuckWhy(p: Pda, word: string, c: Config, by: AcceptBy): string {
  const top = c.stack ? `${c.stack[0]} on top` : 'an empty stack';
  if (c.pos < word.length) return `${c.state} has no move that reads ${word[c.pos]} with ${top}`;
  return by === 'state'
    ? `the word is used up, ${c.state} is not an accept state, and no ε-move fits`
    : `the word is used up, the stack is not empty, and no ε-move fits`;
}

/** "(q1, ab, $) has no move ..., so that branch dies." for up to two, then a count. */
function dyingSay(p: Pda, word: string, dying: SearchNode[], by: AcceptBy): string {
  if (!dying.length) return '';
  const told = dying
    .slice(0, 2)
    .map((n) => `${shortConfig(n.config, word)}: ${stuckWhy(p, word, n.config, by)}`);
  const rest = dying.length - told.length;
  const tail = rest ? `, and ${plural(rest, 'other')} with no move` : '';
  return ` ${dying.length === 1 ? 'A branch dies' : `${dying.length} branches die`}: ${told.join('; ')}${tail}.`;
}

/** A configuration for narration, with a very deep stack cut: "(q1, ab, Saaaaaaaa…$)". */
export const shortConfig = (c: Config, word: string): string =>
  configText(
    c.stack.length > 12 ? { ...c, stack: `${c.stack.slice(0, 9)}…${c.stack.at(-1)}` } : c,
    word,
  );

const acceptWhy = (c: Config, by: AcceptBy) =>
  by === 'state' ? `and ${c.state} is an accept state` : 'with an empty stack';

// ---------------------------------------------------------------------------------------------
// Running

const lineChars = (c: Config, word: string) =>
  c.state.length + Math.max(1, word.length - c.pos) + Math.max(1, c.stack.length) + 2;

/** The room for runs of these searches: the tape, the stack and the panel's lines. */
export function frameOf(searches: Search[]): Frame {
  let rows = 1;
  let chars = 16;
  let room = 0;
  for (const s of searches) {
    room = Math.max(room, s.word.length);
    for (const n of s.nodes) {
      rows = Math.max(rows, n.config.stack.length);
      chars = Math.max(chars, lineChars(n.config, s.word));
    }
  }
  return { room, rows: Math.min(rows, STACK_ROWS), chars: Math.min(chars, MAX_CHARS) };
}

function runVars(r: PdaShow | null): Record<string, Scalar> {
  if (!r) return { state: NONE, read: 0, moves: 0, height: 0, configurations: 0 };
  return {
    state: r.focus.state,
    read: r.focus.pos,
    moves: r.moves,
    height: r.focus.stack.length,
    configurations: r.explored,
  };
}

/** The lines for a level: dying configurations first, then the new ones, the focus kept. */
function levelLines(
  dying: SearchNode[],
  kids: SearchNode[],
  focus: number,
): { lines: ShowLine[]; more: number } {
  const all = [...dying.slice(0, 2), ...kids];
  const toLine = (n: SearchNode): ShowLine => ({ n: n.id, index: n.depth, config: n.config });
  if (all.length <= KEEP) return { lines: all.map(toLine), more: 0 };
  let shown = all.slice(0, KEEP - 1);
  if (!shown.some((n) => n.id === focus))
    shown = [...shown.slice(0, -1), all.find((n) => n.id === focus)!];
  return { lines: shown.map(toLine), more: all.length - shown.length };
}

const pathLines = (s: Search, path: number[], upTo: number): ShowLine[] =>
  path
    .slice(Math.max(0, upTo + 1 - KEEP), upTo + 1)
    .map((id) => ({ n: id, index: s.nodes[id]!.depth, config: s.nodes[id]!.config }));

/**
 * The steps of one run. `wrap` lets Test replay a run as fine detail inside its table. The
 * search is done first; the steps then show it ("every branch") or only the computation that
 * matters ("the computation only").
 */
function* runSteps(
  s: S,
  p: Pda,
  word: string,
  settings: PdaSettings,
  wrap: (st: PdaStep) => PdaStep,
  frame?: Frame,
): Generator<PdaStep, Search, void> {
  const by = settings.accept;
  const sr = search(p, word, by);
  const fr = frame ?? frameOf([sr]);
  const nodes = sr.nodes;
  const w = wordText(word);
  const cfg = (n: SearchNode) => shortConfig(n.config, word);
  const many = branched(sr);
  const all = settings.search === 'all';
  const end = sr.found ?? (sr.outcome === 'stopped' ? nodes.length - 1 : furthest(sr));
  const path = pathTo(sr, end);
  const onPath = new Map(path.map((id) => [nodes[id]!.depth, id]));
  const ls = levels(sr);

  /** What a step shows: `node` is the configuration the tape and the stack follow. */
  interface Look {
    node: number;
    pushed?: number;
    live: string[];
    dead: string[];
    lines: ShowLine[];
    more: number;
    explored: number;
    verdict?: PdaVerdict;
  }
  const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[], look: Look) => {
    const { node, pushed, ...rest } = look;
    const show: PdaShow = {
      ...rest,
      word,
      focus: nodes[node]!.config,
      moves: nodes[node]!.depth,
      pushed: pushed ?? 0,
      frame: fr,
    };
    return wrap({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(show),
      extra: { run: show, frame: fr },
    });
  };
  const moveMarks = (n: SearchNode): Mark[] => {
    const m = p.moves[n.move!]!;
    return [mark(moveId(m.from, m.to), 'active'), mark(moveLineId(n.move!), 'active')];
  };
  const pushedBy = (n: SearchNode) => (n.move === null ? 0 : p.moves[n.move]!.push.length);
  const start = nodes[0]!;

  // The start.
  const intro = `Run the machine on ${w}.${word ? '' : ' The word is empty: there is nothing to read.'}`;
  const startSay = `It starts in ${cfg(start)}: state ${p.start}, ${word ? 'all of the word to read' : 'nothing to read'}, and ${stackWords(p.initial)}.`;
  let summary = many
    ? ' The machine has choices, so a breadth-first search follows every branch, one move at a time.'
    : '';
  if (!all) {
    const k = sr.found === null ? 0 : nodes[sr.found]!.depth;
    const choices = many
      ? `The machine has choices, so a breadth-first search tries them all: it explored ${plural(nodes.length, 'configuration')}`
      : 'The machine never has a choice of move here, so there is only one computation';
    summary =
      sr.outcome === 'stopped'
        ? ` The search stopped after ${CAP} configurations without finding an accepting one. Here is the furthest it got.`
        : !many
          ? ` ${choices} to follow.`
          : sr.outcome === 'accept'
            ? ` ${choices} and found an accepting computation of ${plural(k, 'move')}. Here it is, one move at a time.`
            : ` ${choices}, and every branch died. Here is the one that got furthest.`;
  }
  yield step(`${intro}${summary} ${startSay}`, ['run.start'], 2, [mark(lineId(0), 'active')], {
    node: 0,
    live: [p.start],
    dead: [],
    lines: [{ n: 0, index: 0, config: start.config }],
    more: 0,
    explored: all ? 1 : nodes.length,
  });

  // Every branch, one move at a time.
  if (all) {
    const last = ls.length - 1;
    for (let d = 1; d <= last; d++) {
      const most = sr.outcome === 'stopped' ? MAX_LEVELS.stopped : MAX_LEVELS.other;
      if (d === most && last > most + 1) {
        // A long search (usually ε-moves that push forever) is summed up.
        const skipped = ls.slice(d, last).flat().length;
        const kids = ls[last - 1]!.map((id) => nodes[id]!);
        const focus = onPath.get(last - 1) ?? kids[0]!.id;
        const { lines, more } = levelLines([], kids, focus);
        yield step(
          `Moves ${d} to ${last - 1} go on the same way, making ${plural(skipped, 'more configuration')}. The deepest stack now holds ${Math.max(...kids.map((n) => n.config.stack.length))} symbols.`,
          ['run.loop', 'run.next'],
          2,
          [mark(lineId(focus), 'active')],
          {
            node: focus,
            live: [...new Set(kids.map((n) => n.config.state))],
            dead: [],
            lines,
            more,
            explored: ls.slice(0, last).flat().length,
          },
        );
        d = last;
      }
      const parents = ls[d - 1]!.map((id) => nodes[id]!).filter((n) => n.tried);
      const kids = ls[d]!.map((id) => nodes[id]!);
      const dying = parents.filter((n) => n.fits === 0);
      const stale = parents.filter((n) => n.fits > 0 && !n.kids.length);
      const forks = parents.filter((n) => n.kids.length > 1);
      const found = sr.found !== null && nodes[sr.found]!.depth === d ? nodes[sr.found]! : null;
      const capped = sr.outcome === 'stopped' && d === last;
      const focus = onPath.get(d) ?? kids[0]!.id;
      let say: string;
      if (parents.length === 1 && kids.length === 1 && !stale.length) {
        const k = kids[0]!;
        say = `Move ${d}: ${moveSay(p.moves[k.move!]!)}. Now ${cfg(k)}.`;
      } else {
        const listed = kids.length <= 3 ? `: ${words(kids.map(cfg))}` : '';
        say = `Move ${d}: ${plural(parents.length, 'configuration')} ${parents.length === 1 ? 'makes' : 'make'} ${plural(kids.length, 'new one')}${listed}.`;
        if (forks.length)
          say += ` ${words(forks.slice(0, 2).map(cfg))}${forks.length > 2 ? ` and ${forks.length - 2} more` : ''} ${forks.length === 1 ? 'has' : 'have'} a choice of moves, so the computation branches.`;
        say += dyingSay(p, word, dying, by);
        if (stale.length)
          say += ` ${words(stale.slice(0, 2).map(cfg))} ${stale.length === 1 ? 'leads' : 'lead'} only to configurations already found.`;
      }
      if (found)
        say += ` ${cfg(found)} has read the whole word ${acceptWhy(found.config, by)}: the search stops.`;
      if (capped)
        say += ` That makes ${CAP} configurations, the cap: the search stops without an answer.`;
      // One branch: the panel shows its computation so far; several: the branches alive now.
      const single = kids.length === 1 && !dying.length && !stale.length;
      const { lines, more } = single
        ? { lines: pathLines(sr, pathTo(sr, focus), d), more: 0 }
        : levelLines(dying, kids, focus);
      const shownIds = new Set(lines.map((l) => l.n));
      const live = [...new Set(kids.map((n) => n.config.state))];
      yield step(
        say,
        [
          'run.take',
          'run.fit',
          'run.next',
          ...(dying.length ? ['run.dies'] : []),
          ...(found ? ['run.accept'] : capped ? ['run.cap'] : ['run.enqueue']),
        ],
        2,
        [
          ...new Map(kids.flatMap(moveMarks).map((m) => [m.id, m])).values(),
          mark(lineId(focus), found?.id === focus ? 'found' : 'active'),
          ...dying.filter((n) => shownIds.has(n.id)).map((n) => mark(lineId(n.id), 'error')),
        ],
        {
          node: focus,
          pushed: pushedBy(nodes[focus]!),
          live,
          dead: [...new Set(dying.map((n) => n.config.state))].filter((q) => !live.includes(q)),
          lines,
          more,
          explored: ls.slice(0, d + 1).flat().length,
        },
      );
    }
  }

  // The computation itself: the accepting one (after the search, when it branched), or in
  // "the computation only" the one that matters.
  const play = !all || (sr.outcome === 'accept' && many);
  if (play && sr.outcome !== 'stopped') {
    for (let k = 1; k < path.length; k++) {
      const n = nodes[path[k]!]!;
      const first =
        all && k === 1 ? 'Now play back the accepting computation, one move at a time. ' : '';
      yield step(
        `${first}Move ${k}: ${moveSay(p.moves[n.move!]!)}. Now ${cfg(n)}.`,
        ['run.play'],
        k <= PLAY_MAX ? 2 : 3,
        [...moveMarks(n), mark(lineId(n.id), 'active')],
        {
          node: n.id,
          pushed: pushedBy(n),
          live: [n.config.state],
          dead: [],
          lines: pathLines(sr, path, k),
          more: 0,
          explored: nodes.length,
        },
      );
    }
  }

  // The verdict.
  const e = nodes[end]!;
  const tail = {
    node: e.id,
    live: [e.config.state],
    dead: [] as string[],
    lines: pathLines(sr, path, path.length - 1),
    more: 0,
    explored: nodes.length,
  };
  if (sr.outcome === 'accept') {
    const moves = e.depth;
    const now = word ? `The machine has read all of ${w}` : 'There is nothing to read';
    const how =
      moves === 0
        ? `The word is empty and the start configuration ${cfg(e)} already accepts (${by === 'state' ? `${e.config.state} is an accept state` : 'the stack is empty'}), so the machine accepts ε without a move.`
        : by === 'state'
          ? `${now}, and it is in ${e.config.state}, an accept state, so it accepts ${w}.`
          : `${now}, and its stack is empty, so it accepts ${w}.`;
    const count = moves
      ? ` The accepting computation takes ${plural(moves, 'move')}${many ? `; the search explored ${plural(nodes.length, 'configuration')} to find it` : ''}.`
      : '';
    yield step(
      `${how}${count}`,
      ['run.accept'],
      1,
      [
        mark(stateId(e.config.state), 'found'),
        mark(lineId(e.id), 'found'),
        mark(verdictId, 'found'),
      ],
      { ...tail, verdict: 'accept' },
    );
  } else if (sr.outcome === 'reject') {
    const why = e.fits
      ? 'its moves lead only to configurations already found'
      : stuckWhy(p, word, e.config, by);
    const say = many
      ? `Every branch has died, so the machine rejects ${w}. The one that got furthest stopped at ${cfg(e)}: ${why}.`
      : `The computation stops at ${cfg(e)}: ${why}. So the machine rejects ${w}.`;
    yield step(
      say,
      ['run.reject'],
      1,
      [
        mark(stateId(e.config.state), 'error'),
        mark(lineId(e.id), 'error'),
        mark(verdictId, 'error'),
      ],
      { ...tail, dead: [e.config.state], live: [], verdict: 'reject' },
    );
  } else {
    yield step(
      `The search has made ${CAP} configurations, its cap, without finding an accepting one, so it stops here without an answer. ε-moves that push can make new configurations forever, so a search like this may never end on its own. It does not mean ${w} is rejected: an accepting computation might need more configurations than the cap allows.`,
      ['run.cap'],
      1,
      [mark(lineId(e.id), 'active'), mark(verdictId, 'active')],
      { ...tail, verdict: 'stopped' },
    );
  }
  return sr;
}

const refuse = (s: S, say: string, lines: string[]): PdaStep => ({
  state: s,
  marks: [],
  say,
  lines,
  level: 1,
  vars: runVars(null),
});

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [arg], { settings }) {
    const raw = String(arg ?? '');
    const problem = wordProblem(raw, s.machine);
    if (problem) {
      yield refuse(s, `Nothing to run. ${problem}`, ['run.sig']);
      return s;
    }
    yield* runSteps(s, s.machine, parsePdaWord(raw, s.machine) as string, settings, (st) => st);
    return s;
  },
};

/** "accepted", "rejected", or "stopped at the cap". */
export const verdictWord = (v: PdaVerdict): string =>
  v === 'accept' ? 'accepted' : v === 'reject' ? 'rejected' : 'stopped at the cap';

function testVars(t: TestTable, r: PdaShow | undefined): Record<string, Scalar> {
  const done = t.rows.filter((x) => x.got !== undefined);
  return {
    ...runVars(r ?? null),
    words: `${done.length} of ${t.rows.length}`,
    mismatches: done.filter((x) => rowOk(x) === false).length,
  };
}

function rowSay(row: TestRow, sr: Search): string {
  const w = wordText(row.word);
  const got = sr.outcome as PdaVerdict;
  const why =
    got === 'accept'
      ? `It is accepted after ${plural(sr.nodes[sr.found!]!.depth, 'move')}.`
      : got === 'reject'
        ? 'Every branch dies, so it is rejected.'
        : `The search stops at the cap of ${CAP} configurations without an answer.`;
  const ok = rowOk(row);
  const verdict =
    ok === null
      ? 'No + or - was given, so there is nothing to compare.'
      : ok
        ? `It should ${row.expect}: as expected.`
        : `It should ${row.expect}: a mismatch.`;
  return `${w}: ${why} ${verdict}`;
}

/** Marks that point at panels the test picture does not draw. */
const inTest = (m: Mark) => m.id !== verdictId && !m.id.startsWith('cfg-');

const test: Op = {
  label: 'Test',
  arity: 1,
  *run(s, [arg], { settings }) {
    const p = s.machine;
    const items = parseBatch(String(arg ?? ''), p);
    if (items instanceof Error) {
      yield refuse(s, `Nothing to test. ${items.message}`, ['test.sig']);
      return s;
    }
    const rows: TestRow[] = items.map((it) => ({ word: it.word, expect: it.expect }));
    const frame = frameOf(rows.map((r) => search(p, r.word, settings.accept)));
    const table = (at: number): TestTable => ({ rows: rows.map((r) => ({ ...r })), at });
    yield {
      state: s,
      marks: [],
      say: `Test ${plural(rows.length, 'word')}. Each one runs from the start configuration, and the table puts what the machine does next to what it should do (+ accept, - reject).`,
      lines: ['test.for'],
      level: 2,
      vars: testVars(table(-1), undefined),
      extra: { test: table(-1), frame },
    } satisfies PdaStep;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      let lastShow: PdaShow | undefined;
      const sr = yield* runSteps(
        s,
        p,
        row.word,
        settings,
        (st) => {
          lastShow = st.extra?.run && { ...st.extra.run, verdict: undefined };
          return {
            ...st,
            say: `${wordText(row.word)}: ${st.say}`,
            lines: ['test.run'],
            level: 3,
            marks: st.marks.filter(inTest),
            vars: testVars(table(i), lastShow),
            extra: { run: lastShow, test: table(i), frame },
          };
        },
        frame,
      );
      // The table's "got" column reads accept, reject or stopped.
      row.got = sr.outcome as Verdict;
      const ok = rowOk(row);
      yield {
        state: s,
        marks: [mark(testRowId(i), ok === false ? 'error' : ok ? 'found' : 'active')],
        say: rowSay(row, sr),
        lines: ok === false ? ['test.check', 'test.mismatch'] : ['test.run', 'test.check'],
        level: 2,
        vars: testVars(table(i), lastShow),
        extra: { run: lastShow, test: table(i), frame },
      } satisfies PdaStep;
    }
    const bad = rows.filter((r) => rowOk(r) === false);
    const checked = rows.filter((r) => rowOk(r) !== null).length;
    const summary =
      checked === 0
        ? `Done: the machine accepts ${plural(rows.filter((r) => r.got === 'accept').length, 'word')} of ${rows.length}. Put + or - in front of a word to say what it should do.`
        : bad.length === 0
          ? `Done: all ${plural(checked, 'word')} with a + or - do what they should.`
          : `Done: ${checked - bad.length} of ${checked} words do what they should. ${bad
              .map(
                (r) =>
                  `${wordText(r.word)} is ${verdictWord(r.got as PdaVerdict)} but should be ${r.expect === 'accept' ? 'accepted' : 'rejected'}`,
              )
              .join('; ')}.`;
    yield {
      state: s,
      marks: bad.map((r) => mark(testRowId(rows.indexOf(r)), 'error')),
      say: summary,
      lines: bad.length ? ['test.mismatch'] : ['test.for'],
      level: 1,
      vars: testVars(table(rows.length), undefined),
      extra: { test: table(rows.length), frame },
    } satisfies PdaStep;
    return s;
  },
};

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const text = String(arg ?? '').trim();
    const p = parsePda(text);
    if (p instanceof Error) {
      const problem =
        text && !looksLikePda(text)
          ? `"${text}" is not a machine. Type moves such as "q0 a, eps -> q0 a; accept q0"; to run a word, press Run.`
          : p.message;
      yield refuse(s, `Nothing loaded. ${problem} The machine stays as it was.`, []);
      return s;
    }
    const next: S = { machine: p };
    const hint =
      settings.accept === 'stack' && p.accept.length
        ? ' Options says accept by empty stack, so its accept states do not count.'
        : settings.accept === 'state' && !p.accept.length
          ? ' It has no accept states, so by final state it accepts nothing: switch Options to accept by empty stack.'
          : '';
    yield {
      state: next,
      marks: [],
      say: `Loaded ${describePda(p)}${hint} Type a word and press Run, or words with + or - in front and press Test.`,
      lines: [],
      level: 1,
      vars: runVars(null),
    } satisfies PdaStep;
    return next;
  },
};

export const ops = { load, run, test };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PdaSettings): PseudoBlock[] {
  const byState = settings.accept === 'state';
  return [
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'RUN(P, w)', 'To run the PDA P on a word w:'),
        L(
          'run.start',
          1,
          'queue = [(q0, w, γ0)]',
          'Start with one configuration: the start state, all of w to read, and the stack the machine starts with (empty unless it says otherwise).',
        ),
        L('run.loop', 1, 'while queue ≠ ∅', 'Keep going while some branch is still alive:'),
        L(
          'run.take',
          2,
          '(q, v, γ) = dequeue(queue)',
          'take the oldest configuration not yet tried (breadth first).',
        ),
        L(
          'run.fit',
          2,
          'for each move q a, X → r β that fits',
          'Try every move of q that fits: it reads a (the next symbol, or nothing for ε) and pops X (the top symbol, or nothing for ε).',
        ),
        L(
          'run.next',
          3,
          'c = (r, v after a, β then γ after X)',
          'Each one makes a configuration: state r, the rest of the input, and the stack with X popped and β pushed.',
        ),
        L('run.seen', 3, 'if c was seen before: skip c', 'Skip a configuration found before.'),
        L(
          'run.cap',
          3,
          `if ${CAP} configurations were made: stop`,
          `After ${CAP} configurations, give up without an answer.`,
        ),
        L(
          'run.accept',
          3,
          byState
            ? 'if c has read all of w and r ∈ F: accept'
            : 'if c has read all of w and its stack is ε: accept',
          byState
            ? 'If it has read the whole word and r is an accept state, accept.'
            : 'If it has read the whole word and its stack is empty, accept.',
        ),
        L('run.enqueue', 3, 'enqueue(queue, c)', 'Otherwise put it at the back of the queue.'),
        L(
          'run.dies',
          2,
          'if no move fits: the branch dies',
          'A configuration with no move that fits is a branch that dies.',
        ),
        L('run.reject', 1, 'reject', 'The queue is empty: every branch has died, so reject.'),
        L(
          'run.play',
          1,
          'after accept: show the moves from (q0, w, γ0) to c',
          'After accepting, show the accepting computation one move at a time, following each configuration back to the one it came from.',
        ),
      ],
    },
    {
      op: 'test',
      lines: [
        L('test.sig', 0, 'TEST(P, batch)', 'To test P on a batch of words:'),
        L(
          'test.for',
          1,
          'for each (w, expected) in batch',
          'Take each word with the answer it should get.',
        ),
        L('test.run', 2, 'got = RUN(P, w)', 'Run P on it.'),
        L('test.check', 2, 'if got ≠ expected', 'If P gives a different answer,'),
        L('test.mismatch', 3, 'report a mismatch', 'report it.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'This PDA accepts aⁿbⁿ: it pushes $, then an a for every a it reads, pops an a for every b, and accepts when $ is back on top. Type a word such as aabb and press Run, or load your own machine.';
}

export const initialVars = (): Record<string, Scalar> => runVars(null);

export function describe(state: S): string {
  const p = state.machine;
  const moves = p.moves.map((m) => `from ${m.from} to ${m.to}, ${moveLabel(m)}`);
  const said = describePda(p);
  return `${said[0]!.toUpperCase()}${said.slice(1)} Moves: ${moves.join('; ')}.`;
}

export function describeRun(r: PdaShow): string {
  const w = wordText(r.word);
  const c = configText(r.focus, r.word);
  const lines = r.lines.map((l) => configText(l.config, r.word)).join(', ');
  const v = r.verdict
    ? ` ${verdictWord(r.verdict)[0]!.toUpperCase()}${verdictWord(r.verdict).slice(1)}.`
    : '';
  return `Run on ${w}: at ${c} after ${plural(r.moves, 'move')}, ${r.focus.pos} of ${r.word.length} symbols read, stack ${r.focus.stack || 'empty'}. Configurations shown: ${lines}.${v}`;
}
