/**
 * BFS over states: breadth-first search on a graph that is never stored. A state is a lock's
 * combination or a word; its neighbours are made when it comes off the queue (turn one wheel
 * up or down, or change one letter), and a visited set keeps each state from being queued
 * twice. The layer a state is found in is its distance from the start.
 *
 * Two puzzles, picked by a setting:
 *
 * - lock: 2 or 3 wheels of digits 0 to 9, starting at 00 (or 000). A move turns one wheel by
 *   one, 9 wrapping round to 0. Some combinations are barred: the lock must never show them.
 *   Moves are tried wheel by wheel, up before down.
 * - words: a list of words of one length; the first is the start. A move changes one letter,
 *   and only words in the list count. Letters are tried position by position, a to z.
 *
 * The goal is checked when a state is made, so the search stops as soon as it appears.
 *
 * The naive way has no visited set: every sequence of moves goes in the queue, shortest first.
 * It finds the same distance, but the queue grows by the branching factor at every layer. The
 * page stops it after MAX_NAIVE sequences and says how many it would take; with no way to the
 * goal it would never stop.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a state is one taken off the queue; a move is
 * one neighbour made (a turn of a wheel, or a letter changed), whether or not it is kept.
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
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';

export type Puzzle = 'lock' | 'words';

/** The naive way stops after this many sequences taken off the queue. */
export const MAX_NAIVE = 300;
export const MAX_WORDS = 10;
export const MAX_BARRED = 12;
/** Chips shown per layer row; past it, one "+m" chip. */
export const ROW_CHIPS = 7;
/** Layer rows shown at once: the deepest ones. */
export const LAYER_ROWS = 5;
/** Moves listed for one state (words can have more neighbours in the list). */
export const MOVE_CELLS = 6;
/** Queue entries shown, front first. */
export const QUEUE_CHIPS = 7;

export const START_BARRED = ['01', '11', '21'];
export const START_TARGET = '02';
export const START_WORDS = ['cold', 'cord', 'bold', 'colt', 'card', 'word', 'ward', 'warm', 'worm'];
export const START_WORD_TARGET = 'warm';

export interface SSSettings {
  [key: string]: Scalar;
  approach: Approach;
  puzzle: Puzzle;
}

export const defaults: SSSettings = { approach: 'pattern', puzzle: 'lock' };

export interface SSState {
  /** The lock: how many wheels, and the combinations it must never show. */
  wheels: number;
  barred: string[];
  /** The word list; the first word is the start. */
  words: string[];
}

/**
 * A state put in the queue: the pattern makes one per state found, the naive way one per
 * sequence of moves (so a state can come back). `again`: the state was queued before.
 */
export interface Entry {
  uid: number;
  state: string;
  d: number;
  parent: number | null;
  again: boolean;
}

export type Verdict = 'new' | 'seen' | 'again' | 'goal' | 'barred';

export interface MoveView {
  to: string;
  verdict: Verdict;
}

export interface SSExtra {
  puzzle: Puzzle;
  start: string;
  target: string;
  /**
   * Every entry of the run, in the order they are made. Only the first `made` exist at this
   * step; entries never change once made, so steps share the list.
   */
  entries: readonly Entry[];
  made: number;
  /** Entries taken off the queue so far: the queue is entries[head..made). */
  head: number;
  /** The entry being expanded. */
  current?: number;
  moves?: MoveView[];
  /** Words: letter changes that are not in the list. */
  skipped?: number;
  /** Fixed for the operation: layer count, and the most moves one state lists. */
  frame: { layers: number; moves: number };
  /** The goal entry once found, and the path to it (uids from the start). */
  goal?: number;
  path?: number[];
  outcome?: 'found' | 'none' | 'stopped';
}

export type SSStep = Step<SSState, SSExtra>;
type Op = OpSpec<SSState, SSSettings, SSExtra>;

export const init = (): SSState => ({
  wheels: 2,
  barred: [...START_BARRED],
  words: [...START_WORDS],
});

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ----- Text -----

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
export const and = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** A big count for narration: 4,096. */
export const big = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US') : 'endless');

export const startOf = (s: SSState, puzzle: Puzzle) =>
  puzzle === 'lock' ? '0'.repeat(s.wheels) : s.words[0]!;

// ----- Input -----

/** For the input box: one combination or word is the goal; several are a list to load. */
export function parseInput(token: string): Value | Error {
  const tokens = token
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  if (tokens.length === 0) return new Error('Type a goal, such as 22 or warm, or a list to load.');
  for (const t of tokens)
    if (!/^(\d{2,3}|[a-z]{3,5})$/.test(t))
      return new Error(
        `"${t}" is neither a combination of 2 or 3 digits nor a word of 3 to 5 letters.`,
      );
  return tokens.join(' ');
}

const tokensOf = (arg: Value | undefined) =>
  String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());

/** A list to load: barred combinations (lock) or words, or why it cannot be read. */
export function readList(
  arg: Value | undefined,
  puzzle: Puzzle,
): string | ((s: SSState) => SSState) {
  const tokens = tokensOf(arg);
  if (puzzle === 'lock') {
    if (tokens.length === 0) return 'Type the barred combinations, such as 10 01.';
    if (tokens.length > MAX_BARRED)
      return `That is ${tokens.length} combinations. Bar at most ${MAX_BARRED}.`;
    const w = tokens[0]!.length;
    for (const t of tokens) {
      if (!/^\d{2,3}$/.test(t)) return `"${t}" is not a combination of 2 or 3 digits.`;
      if (t.length !== w)
        return `${tokens[0]} has ${w} digits but ${t} has ${t.length}. Give every combination the same number of wheels.`;
      if (/^0+$/.test(t)) return `${t} is where the lock starts, so it cannot be barred.`;
    }
    const barred = [...new Set(tokens)];
    return (s: SSState) => ({ ...s, wheels: w, barred });
  }
  if (tokens.length < 2) return 'Type at least 2 words of one length; the first is the start.';
  if (tokens.length > MAX_WORDS) return `That is ${tokens.length} words. Use at most ${MAX_WORDS}.`;
  const len = tokens[0]!.length;
  for (const t of tokens) {
    if (!/^[a-z]{3,5}$/.test(t)) return `"${t}" is not a word of 3 to 5 letters.`;
    if (t.length !== len)
      return `${tokens[0]} has ${len} letters but ${t} has ${t.length}. Give every word the same length.`;
  }
  if (new Set(tokens).size !== tokens.length) return 'A word is there twice. Give each word once.';
  return (s: SSState) => ({ ...s, words: tokens });
}

/** The goal typed for a search: one combination or word, or '' for anything else. */
export function readTarget(arg: Value | undefined): string {
  const tokens = tokensOf(arg);
  return tokens.length === 1 ? tokens[0]! : '';
}

export function targetProblem(t: string, s: SSState, puzzle: Puzzle): string | null {
  if (puzzle === 'lock') {
    if (!new RegExp(`^\\d{${s.wheels}}$`).test(t))
      return `The lock has ${s.wheels} wheels: type a goal of ${s.wheels} digits, such as ${s.wheels === 2 ? '22' : '222'}.`;
    if (s.barred.includes(t)) return `${t} is barred, so the lock can never show it.`;
    return null;
  }
  if (!/^[a-z]+$/.test(t))
    return 'Type a goal word from the list, such as ' + s.words[s.words.length - 1] + '.';
  if (!s.words.includes(t)) return `${t} is not in the word list: ${s.words.join(', ')}.`;
  return null;
}

// ----- Moves, made on the fly -----

const turn = (digit: string, by: number) => String((Number(digit) + by + 10) % 10);

/** Every move from a state, in order: the state it makes, and whether that state is allowed. */
export function movesFrom(s: SSState, puzzle: Puzzle, from: string): { to: string; ok: boolean }[] {
  const out: { to: string; ok: boolean }[] = [];
  if (puzzle === 'lock') {
    const barred = new Set(s.barred);
    for (let i = 0; i < from.length; i++)
      for (const by of [1, -1]) {
        const to = from.slice(0, i) + turn(from[i]!, by) + from.slice(i + 1);
        out.push({ to, ok: !barred.has(to) });
      }
    return out;
  }
  const words = new Set(s.words);
  for (let i = 0; i < from.length; i++)
    for (let c = 97; c <= 122; c++) {
      const ch = String.fromCharCode(c);
      if (ch === from[i]) continue;
      const to = from.slice(0, i) + ch + from.slice(i + 1);
      out.push({ to, ok: words.has(to) });
    }
  return out;
}

/** Moves made per state: 2 per wheel, or 25 per letter. */
export const branching = (s: SSState, puzzle: Puzzle, from: string) =>
  puzzle === 'lock' ? 2 * from.length : 25 * from.length;

// ----- The search, worked out first -----

export interface Expansion {
  uid: number;
  moves: MoveView[];
  /** Moves made, including those not kept. */
  made: number;
  /** Words: letter changes not in the list. */
  skipped: number;
  /** Entries that exist after this expansion. */
  after: number;
}

export interface SearchRun {
  entries: Entry[];
  expansions: Expansion[];
  outcome: 'found' | 'none' | 'stopped';
  goal?: number;
  distance: number;
}

/** BFS with a visited set (pattern), or with none (naive, stopped after `cap` states). */
export function search(
  s: SSState,
  puzzle: Puzzle,
  target: string,
  approach: Approach,
  cap = MAX_NAIVE,
): SearchRun {
  const start = startOf(s, puzzle);
  const entries: Entry[] = [{ uid: 0, state: start, d: 0, parent: null, again: false }];
  const expansions: Expansion[] = [];
  if (start === target) return { entries, expansions, outcome: 'found', goal: 0, distance: 0 };
  const seen = new Set([start]);
  const naive = approach === 'naive';
  let head = 0;
  while (head < entries.length) {
    if (naive && expansions.length >= cap)
      return { entries, expansions, outcome: 'stopped', distance: -1 };
    const e = entries[head++]!;
    const moves: MoveView[] = [];
    let made = 0;
    let skipped = 0;
    for (const m of movesFrom(s, puzzle, e.state)) {
      made++;
      if (!m.ok) {
        if (puzzle === 'lock') moves.push({ to: m.to, verdict: 'barred' });
        else skipped++;
        continue;
      }
      const again = seen.has(m.to);
      if (m.to === target) {
        moves.push({ to: m.to, verdict: 'goal' });
        const uid = entries.length;
        entries.push({ uid, state: m.to, d: e.d + 1, parent: e.uid, again });
        expansions.push({ uid: e.uid, moves, made, skipped, after: entries.length });
        return { entries, expansions, outcome: 'found', goal: uid, distance: e.d + 1 };
      }
      if (again && !naive) {
        moves.push({ to: m.to, verdict: 'seen' });
        continue;
      }
      moves.push({ to: m.to, verdict: again ? 'again' : 'new' });
      seen.add(m.to);
      entries.push({ uid: entries.length, state: m.to, d: e.d + 1, parent: e.uid, again });
    }
    expansions.push({ uid: e.uid, moves, made, skipped, after: entries.length });
  }
  return { entries, expansions, outcome: 'none', distance: -1 };
}

/** What BFS with a visited set costs: states taken off the queue, and moves made. */
export function patternCost(s: SSState, puzzle: Puzzle, target: string) {
  const r = search(s, puzzle, target, 'pattern');
  let moves = 0;
  for (const x of r.expansions) moves += x.made;
  return { states: r.expansions.length, moves, distance: r.distance };
}

/**
 * What the naive way costs to the end, without running it: counted layer by layer. Layer L
 * holds one sequence per walk of L moves through allowed states, in the order of their moves.
 * The search stops at the first sequence of the layer before the goal's that has the goal as
 * a move. Infinity when the goal cannot be reached and the sequences never run out.
 */
export function naiveCost(s: SSState, puzzle: Puzzle, target: string) {
  const start = startOf(s, puzzle);
  const { distance } = patternCost(s, puzzle, target);
  if (distance === 0) return { states: 0, moves: 0 };
  const allowed = (st: string) =>
    movesFrom(s, puzzle, st)
      .filter((m) => m.ok)
      .map((m) => m.to);
  const b = branching(s, puzzle, start);
  if (distance < 0) {
    // No way to the goal: the queue empties only if no sequence can ever grow.
    const first = allowed(start);
    return first.length === 0 ? { states: 1, moves: b } : { states: Infinity, moves: Infinity };
  }
  // walks[r] maps a state to how many walks of r moves start there.
  const memo = new Map<string, number>();
  const walks = (st: string, r: number): number => {
    if (r === 0) return 1;
    const key = `${st}/${r}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let t = 0;
    for (const nx of allowed(st)) t += walks(nx, r - 1);
    memo.set(key, t);
    return t;
  };
  // reaches(st, r): some walk of r moves from st ends next to the goal.
  const near = new Map<string, boolean>();
  const reaches = (st: string, r: number): boolean => {
    const key = `${st}/${r}`;
    const hit = near.get(key);
    if (hit !== undefined) return hit;
    const v = r === 0 ? allowed(st).includes(target) : allowed(st).some((nx) => reaches(nx, r - 1));
    near.set(key, v);
    return v;
  };
  let states = 0;
  for (let L = 0; L < distance - 1; L++) states += walks(start, L);
  // Within the last layer, count the sequences before the first one next to the goal.
  let st = start;
  let before = 0;
  for (let r = distance - 1; r > 0; r--) {
    for (const nx of allowed(st)) {
      if (reaches(nx, r - 1)) {
        st = nx;
        break;
      }
      before += walks(nx, r - 1);
    }
  }
  states += before + 1;
  const last = movesFrom(s, puzzle, st).findIndex((m) => m.ok && m.to === target) + 1;
  return { states, moves: (states - 1) * b + last };
}

export function totals(s: SSState, puzzle: Puzzle, target: string): Totals {
  const n = naiveCost(s, puzzle, target);
  const p = patternCost(s, puzzle, target);
  return { naive: n.states + n.moves, pattern: p.states + p.moves };
}

/** The deepest layer of the run: the frame's row count is that plus one. */
const layersOf = (r: SearchRun) => Math.max(...r.entries.map((e) => e.d)) + 1;

// ----- Where an entry is drawn (shared with the view, so marks always find their shape) -----

/** The first layer row shown when the deepest layer so far is `deepest`. */
export const topRow = (deepest: number) => Math.max(0, deepest - LAYER_ROWS + 1);

/** Each entry's position in its layer, for the first `made` entries. */
export function positions(entries: readonly Entry[], made: number): number[] {
  const count = new Map<number, number>();
  const pos: number[] = [];
  for (let i = 0; i < made; i++) {
    const d = entries[i]!.d;
    const p = count.get(d) ?? 0;
    pos.push(p);
    count.set(d, p + 1);
  }
  return pos;
}

/** The chip an entry is drawn as, or null when its layer row is not shown. */
export function chipOf(entries: readonly Entry[], made: number, uid: number): string | null {
  const deepest = entries[made - 1]!.d;
  const e = entries[uid]!;
  if (e.d < topRow(deepest)) return null;
  const p = positions(entries, made)[uid]!;
  let inRow = 0;
  for (let i = 0; i < made; i++) if (entries[i]!.d === e.d) inRow++;
  return inRow > ROW_CHIPS && p >= ROW_CHIPS - 1 ? `ly-${e.d}-more` : `st-${uid}`;
}

// ----- Steps -----

function refuse(s: SSState, why: string): SSStep {
  return {
    state: s,
    marks: [],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: {},
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const puzzle = settings.puzzle;
    const r = readList(arg, puzzle);
    if (typeof r === 'string') {
      yield refuse(s, `${r} The puzzle stays as it was.`);
      return s;
    }
    const next = r(s);
    yield {
      state: next,
      marks: [],
      say:
        puzzle === 'lock'
          ? `A lock with ${next.wheels} wheels, starting at ${'0'.repeat(next.wheels)}, that must never show ${and(next.barred)}. Type a goal and press Search.`
          : `The word list is ${and(next.words)}. The search starts at ${next.words[0]}. Type a goal word and press Search.`,
      lines: [],
      level: 1,
      vars: {},
    };
    return next;
  },
};

/** How a move's cell is marked: kept moves green, the goal found, the rest muted. */
export const verdictRole: Record<Verdict, MarkRole> = {
  new: 'new',
  seen: 'stale',
  again: 'compare',
  goal: 'found',
  barred: 'remove',
};

const verdictWord: Record<Verdict, string> = {
  new: 'new',
  seen: 'seen',
  again: 'again',
  goal: 'goal',
  barred: 'barred',
};

/** "11 new, 91 new and 00 seen". */
function movesText(moves: MoveView[]): string {
  return and(moves.map((m) => `${m.to} ${verdictWord[m.verdict]}`));
}

function* run(s: SSState, target: string, settings: SSSettings): Generator<SSStep, SSState, void> {
  const puzzle = settings.puzzle;
  const approach = approachOf(settings);
  const naive = approach === 'naive';
  const lock = puzzle === 'lock';
  const start = startOf(s, puzzle);
  const r = search(s, puzzle, target, approach);
  const tot = totals(s, puzzle, target);
  const other = naive ? patternCost(s, puzzle, target) : naiveCost(s, puzzle, target);
  const work = new Work(['states', 'moves']);
  const frame = {
    layers: layersOf(r),
    moves: Math.min(MOVE_CELLS, Math.max(0, ...r.expansions.map((x) => x.moves.length))),
  };
  let made = 1;
  let head = 0;
  const extra = (more: Partial<SSExtra> = {}): SSExtra => ({
    puzzle,
    start,
    target,
    entries: r.entries,
    made,
    head,
    frame,
    ...more,
  });
  const vars = (d: number | null, more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    goal: target,
    d,
    queue: Math.max(0, made - head - (r.goal !== undefined && made > r.goal ? 1 : 0)),
    ...(naive ? {} : { visited: made }),
    ...more,
    ...workVars(work, tot),
  });
  const chip = (uid: number) => chipOf(r.entries, made, uid);
  const marks = (pairs: [string | null, MarkRole][]) =>
    pairs.filter((p): p is [string, MarkRole] => p[0] !== null).map(([id, role]) => mark(id, role));
  const what = lock ? 'combination' : 'word';
  const move = lock ? 'turn one wheel up or down' : 'change one letter to a word in the list';

  yield {
    state: s,
    marks: marks([[chip(0), 'active']]),
    say: naive
      ? `Find the fewest moves from ${start} to ${target}. A move: ${move}. No visited set: every sequence of moves goes in the queue, shortest first. Start with the empty sequence, ${start}.`
      : `Find the fewest moves from ${start} to ${target}. A move: ${move}. The graph is never stored: a state's moves are made when it leaves the queue. Start with ${start} at distance 0: visited = {${start}}, queue = [${start}].`,
    lines: ['init'],
    level: 2,
    vars: vars(0),
    extra: extra(),
  };

  if (start === target) {
    yield {
      state: s,
      marks: marks([[chip(0), 'found']]),
      say: `${start} is already the goal: 0 moves.`,
      lines: ['same'],
      level: 1,
      vars: vars(0, { distance: 0 }),
      extra: extra({ goal: 0, path: [0], outcome: 'found' }),
    };
    return s;
  }

  for (const x of r.expansions) {
    const e = r.entries[x.uid]!;
    head = x.uid + 1;
    made = x.after;
    work.add('states');
    work.add('moves', x.made);
    const found = x.moves.some((m) => m.verdict === 'goal');
    const kept = x.moves.filter((m) => m.verdict === 'new' || m.verdict === 'again');
    const seq = naive ? ` (the sequence ${pathText(r.entries, x.uid)})` : '';
    const listed = x.moves.length ? `: ${movesText(x.moves)}` : '';
    const skippedText =
      !lock && x.skipped
        ? ` ${plural(x.skipped, 'letter change')} ${x.skipped === 1 ? 'makes' : 'make'} no word in the list.`
        : '';
    const goalText = found ? ` ${target} is the goal: stop.` : '';
    const waste =
      naive && x.moves.some((m) => m.verdict === 'again')
        ? ` States marked again were queued before; with no visited set they go in once more.`
        : '';
    yield {
      state: s,
      marks: marks([
        [chip(x.uid), 'active'],
        ...x.moves.map((m, i): [string | null, MarkRole] => [
          i < MOVE_CELLS ? `mv-${i}` : null,
          verdictRole[m.verdict],
        ]),
      ]),
      say: `Take ${e.state} off the queue, at distance ${e.d}${seq}. Its ${lock ? 'moves' : 'words one letter away'}${listed || ': none'}.${skippedText}${kept.length && !found ? ` ${plural(kept.length, 'state')} join${kept.length === 1 ? 's' : ''} the queue at distance ${e.d + 1}.` : ''}${goalText}${waste}`,
      lines: found
        ? ['loop', 'pop', 'gen', 'goal']
        : naive
          ? ['loop', 'pop', 'gen', 'push']
          : ['loop', 'pop', 'gen', 'skip', 'push'],
      level: 2,
      vars: vars(e.d),
      extra: extra({
        current: x.uid,
        moves: x.moves,
        ...(lock ? {} : { skipped: x.skipped }),
      }),
    };
  }

  // The end: found, no way, or the naive way stopped. The moves of the last state stay drawn.
  const last = r.expansions.at(-1);
  let say: string;
  let path: number[] | undefined;
  let goalMarks: [string | null, MarkRole][] = [];
  if (r.outcome === 'found') {
    path = pathOf(r.entries, r.goal!);
    goalMarks = [
      ['path', 'found'],
      ...path.map((u): [string | null, MarkRole] => [chip(u), 'found']),
    ];
    const names = path.map((u) => r.entries[u]!.state);
    say = `${target} is ${plural(r.distance, 'move')} from ${start}: ${names.join(' → ')}. ${
      naive
        ? `With no visited set, ${big(work.get('states'))} sequences left the queue and made ${big(work.get('moves'))} moves; BFS with a visited set takes ${plural(other.states, 'state')} and ${plural(other.moves, 'move')}.`
        : `BFS took ${plural(work.get('states'), 'state')} off the queue and made ${plural(work.get('moves'), 'move')}, visiting ${plural(made, 'state')}. With no visited set it would take ${big(other.states)} sequences and ${big(other.moves)} moves.`
    }`;
  } else if (r.outcome === 'none') {
    say = `The queue is empty: ${target} cannot be reached from ${start}. BFS visited every ${what} it could reach, ${made} of them, and made ${plural(work.get('moves'), 'move')}. ${
      naive
        ? ''
        : 'With no visited set the search would never stop: sequences can go round and round for ever.'
    }`;
  } else {
    const p = patternCost(s, puzzle, target);
    say = `Stop here: ${big(MAX_NAIVE)} sequences have left the queue and ${big(made - head)} are still in it. ${
      Number.isFinite(other.states) && p.distance >= 0
        ? `To reach ${target} this way takes ${big(naiveCost(s, puzzle, target).states)} sequences in all.`
        : `${target} cannot be reached, so this would never stop.`
    } BFS with a visited set ${p.distance >= 0 ? `finds it at distance ${p.distance} after` : 'gives up after'} ${plural(p.states, 'state')}.`;
  }
  yield {
    state: s,
    marks: marks(goalMarks),
    say,
    lines: r.outcome === 'found' ? ['goal'] : ['none'],
    level: 1,
    vars: vars(r.outcome === 'found' ? r.distance : null, { distance: r.distance }),
    extra: extra({
      ...(last
        ? { current: last.uid, moves: last.moves, ...(lock ? {} : { skipped: last.skipped }) }
        : {}),
      ...(r.goal !== undefined ? { goal: r.goal } : {}),
      ...(path ? { path } : {}),
      outcome: r.outcome,
    }),
  };
  return s;
}

/** The uids from the start to an entry. */
export function pathOf(entries: readonly Entry[], uid: number): number[] {
  const out: number[] = [];
  for (let u: number | null = uid; u !== null; u = entries[u]!.parent) out.unshift(u);
  return out;
}

const pathText = (entries: readonly Entry[], uid: number) =>
  pathOf(entries, uid)
    .map((u) => entries[u]!.state)
    .join(' → ');

const find: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [arg], { settings }) {
    const puzzle = settings.puzzle;
    const target = readTarget(arg);
    if (!target) {
      yield refuse(
        s,
        puzzle === 'lock'
          ? 'Type one goal combination, such as 22.'
          : 'Type one goal word, such as warm.',
      );
      return s;
    }
    const problem = targetProblem(target, s, puzzle);
    if (problem) {
      yield refuse(s, problem);
      return s;
    }
    return yield* run(s, target, settings);
  },
};

export const ops: Record<string, Op> = { search: find, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: SSSettings): PseudoBlock[] {
  const lock = settings.puzzle !== 'words';
  const naive = approachOf(settings) === 'naive';
  const gen = lock
    ? L(
        'gen',
        2,
        'for each wheel i, up then down: t = turn(s, i)',
        'turn each wheel up and down, one at a time;',
      )
    : L(
        'gen',
        2,
        'for each position i, each letter c: t = s with c at i',
        'change each letter to every other letter, one at a time;',
      );
  const allowed = lock ? 't is barred' : 't is not in the list';
  const loadBlock: PseudoBlock = {
    op: 'load',
    lines: [
      lock
        ? L(
            'load',
            0,
            'barred = the combinations',
            'Remember the combinations the lock must never show.',
          )
        : L(
            'load',
            0,
            'words = the list; start = words[0]',
            'Remember the word list; the first word is the start.',
          ),
    ],
  };
  const main = naive
    ? [
        L(
          'sig',
          0,
          'fewestMoves(start, goal)   // no visited set',
          'To find the fewest moves, trying every sequence:',
        ),
        L('same', 1, 'if start == goal: return 0', 'The start may already be the goal.'),
        L('init', 1, 'queue = [(start, 0)]', 'Queue the empty sequence, at distance 0.'),
        L('loop', 1, 'while queue is not empty', 'While sequences are waiting,'),
        L('pop', 2, '(s, d) = queue.popFront()', 'take the shortest from the front;'),
        gen,
        L(
          'skip',
          3,
          `if ${allowed}: continue`,
          lock ? 'skip a barred combination;' : 'skip a change that makes no word;',
        ),
        L(
          'goal',
          3,
          'if t == goal: return d + 1',
          'if t is the goal, that sequence is the answer;',
        ),
        L(
          'push',
          3,
          'queue.pushBack((t, d + 1))',
          'queue the longer sequence, even if t was queued before.',
        ),
        L('none', 1, 'return −1', 'Nothing left: the goal cannot be reached.'),
      ]
    : [
        L('sig', 0, 'fewestMoves(start, goal)', 'To find the fewest moves from start to goal:'),
        L('same', 1, 'if start == goal: return 0', 'The start may already be the goal.'),
        L(
          'init',
          1,
          'queue = [start]; dist = {start: 0}',
          'Queue the start at distance 0; it is visited.',
        ),
        L('loop', 1, 'while queue is not empty', 'While states are waiting,'),
        L('pop', 2, 's = queue.popFront()', 'take the one at the front;'),
        gen,
        L(
          'skip',
          3,
          `if ${allowed} or t in dist: continue`,
          lock
            ? 'skip a barred combination or one already visited;'
            : 'skip a change that makes no word, or a word already visited;',
        ),
        L(
          'goal',
          3,
          'if t == goal: return dist[s] + 1',
          'if t is the goal, its distance is the answer;',
        ),
        L(
          'push',
          3,
          'dist[t] = dist[s] + 1; queue.pushBack(t)',
          'otherwise visit it, one move further, and queue it.',
        ),
        L('none', 1, 'return −1', 'The queue ran out: the goal cannot be reached.'),
      ];
  return [{ op: 'search', lines: main }, loadBlock];
}

// ----- Start -----

export function describe(s: SSState, settings: SSSettings): string {
  return settings.puzzle === 'lock'
    ? `A lock with ${s.wheels} wheels at ${'0'.repeat(s.wheels)}; barred: ${s.barred.join(', ')}.`
    : `Words: ${s.words.join(', ')}; the start is ${s.words[0]}.`;
}

export function initialSay(s: SSState, settings: SSSettings): string {
  return settings.puzzle === 'lock'
    ? `A lock with ${s.wheels} wheels shows ${'0'.repeat(s.wheels)} and must never show ${and(s.barred)}. Type a goal, such as ${s.wheels === 2 ? START_TARGET : '222'}, and press Search for the fewest turns that reach it.`
    : `Change ${s.words[0]} into another word of the list, one letter at a time, every step a word. Type a goal, such as ${s.words.includes(START_WORD_TARGET) ? START_WORD_TARGET : s.words[s.words.length - 1]}, and press Search.`;
}

export const initialVars = (): Record<string, Scalar> => ({});
