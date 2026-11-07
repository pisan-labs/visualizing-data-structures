/**
 * DFA minimization. Minimize first makes the DFA complete (a dead state takes every missing
 * move) and drops the states the start never reaches, each as a step of its own; then it
 * merges the states no word can tell apart, by one of two methods (the `method` setting):
 *
 * - 'moore' (the default): partition refinement. Start with two blocks, the accept states and
 *   the rest. Each round, a state's signature lists the block each of its moves leads to;
 *   states of one block whose signatures differ split up. When a round splits nothing, every
 *   block is a state of the minimal DFA. A block that splits keeps its number for the part
 *   holding its first state, so its color stays; the other parts get new numbers.
 * - 'table': table filling (Myhill–Nerode). Mark every pair of an accept and a non-accept
 *   state (ε tells them apart); then, pass after pass, mark a pair when some symbol takes it to
 *   a marked pair, and write that symbol in its cell. Pairs never marked are equivalent.
 *
 * The minimal DFA names each state after the first state of its block, in name order, as
 * minimize() in the shared kit does. The state is just the loaded DFA; a run's bookkeeping
 * travels in the steps' `extra`, and the last step shows the minimal DFA.
 */
import {
  type Mark,
  type OpSpec,
  type PseudoBlock,
  type Scalar,
  type Step,
} from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import {
  complete,
  isComplete,
  makeAutomaton,
  reachable,
  type Automaton,
  type Minimized,
} from '../_automata/automaton';
import { parseAutomaton } from '../_automata/parse';
import { loadAutomatonOp, words } from '../nfa-to-dfa/kit';

export interface MinState {
  dfa: Automaton;
}

export type Method = 'moore' | 'table';

export interface MinSettings {
  [key: string]: Scalar;
  method: Method;
}

export const defaults: MinSettings = { method: 'moore' };

/** Ends in ab, with q3 a copy of q0: q0 and q3 merge, and the minimal DFA has 3 states. */
export const START_TEXT =
  'start q0; accept q2; q0 a -> q1; q0 b -> q3; q1 a -> q1; q1 b -> q2; q2 a -> q1; q2 b -> q3; q3 a -> q1; q3 b -> q0';

export interface MinRun {
  method: Method;
  /** The DFA being minimized as it stands: complete once the first step has run. */
  work: Automaton;
  /** The dead state that completing the DFA added, if any. */
  added?: string;
  /** States about to be dropped (faded on the step that drops them). */
  dropping: string[];
  /** Block numbers, from 1 (Moore during the run; both methods at the end). */
  block: Record<string, number>;
  /** Moore: the round, and the signatures worked out so far this round. */
  round: number;
  sig: Record<string, number[]>;
  /** Moore: the state being looked at. Table: the pair being looked at. */
  q?: string;
  pair?: [string, string];
  /** Table: marked pairs, by pairKey, with the symbol that separates them (ε for accepting). */
  marked: Record<string, string>;
  pass: number;
  /** Past completing and dropping: the method's table is in use. */
  refining: boolean;
  /** At the end: the minimal DFA, and the states each of its states merges. */
  min?: Automaton;
  blocks?: Record<string, string[]>;
}

export interface MinExtra {
  run?: MinRun;
}

type S = MinState;
type X = MinExtra;
type MinStep = Step<S, X>;
type Op = OpSpec<S, MinSettings, X>;

export function init(): S {
  return { dfa: parseAutomaton(START_TEXT) as Automaton };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Shape ids: the minimal DFA's start with MIN_PREFIX; Moore's table cells are sigCell. */
export const MIN_PREFIX = 'min-';
export const sigCell = (q: string, col: 'name' | 'block' | string) =>
  `sig-${q}-${col === 'name' || col === 'block' ? col : `on-${col}`}`;
/** The pair table cell of p and q, either order: row is the later state in `states`. */
export function pairCell(states: string[], p: string, q: string): string {
  const [a, b] = states.indexOf(p) < states.indexOf(q) ? [p, q] : [q, p];
  return `pt-m-${b}-${a}`;
}
export function pairKey(states: string[], p: string, q: string): string {
  return states.indexOf(p) < states.indexOf(q) ? `${p}|${q}` : `${q}|${p}`;
}

export const delta = (a: Automaton, q: string, c: string): string =>
  a.moves.find((m) => m.from === q && m.on === c)!.to;

/** A set in narration, spaced as elsewhere on the site: { q0, q3 }. */
export const setText = (set: readonly string[]) => `{ ${set.join(', ')} }`;

/** The minimal DFA from a partition: each block is a state named after its first state. */
export function merge(work: Automaton, blockOf: Record<string, number>): Minimized {
  const members = new Map<number, string[]>();
  for (const q of work.states) members.set(blockOf[q]!, [...(members.get(blockOf[q]!) ?? []), q]);
  const nameOf = (q: string) => members.get(blockOf[q]!)![0]!;
  const blocks: Record<string, string[]> = {};
  for (const m of members.values()) blocks[m[0]!] = m;
  const dfa = makeAutomaton({
    states: Object.keys(blocks),
    alphabet: work.alphabet,
    start: nameOf(work.start),
    accept: Object.keys(blocks).filter((b) => work.accept.includes(b)),
    moves: Object.keys(blocks).flatMap((b) =>
      work.alphabet.map((c) => ({ from: b, on: c, to: nameOf(delta(work, b, c)) })),
    ),
  });
  return { dfa, blocks };
}

/** Number the blocks 1, 2, ... in the order of their first states. */
function renumber(states: string[], same: (p: string, q: string) => boolean) {
  const block: Record<string, number> = {};
  let k = 0;
  for (const q of states) {
    if (block[q]) continue;
    block[q] = ++k;
    for (const p of states) if (!block[p] && same(q, p)) block[p] = k;
  }
  return block;
}

const count = (block: Record<string, number>) => new Set(Object.values(block)).size;

function clone(r: MinRun): MinRun {
  return {
    ...r,
    dropping: [...r.dropping],
    block: { ...r.block },
    sig: Object.fromEntries(Object.entries(r.sig).map(([q, s]) => [q, [...s]])),
    pair: r.pair && [...r.pair],
    marked: { ...r.marked },
  };
}

export function dfaVars(a: Automaton): Record<string, Scalar> {
  return { '|Q|': a.states.length, '|Σ|': a.alphabet.length };
}

function runVars(r: MinRun): Record<string, Scalar> {
  const out: Record<string, Scalar> = { '|Q|': r.work.states.length };
  if (r.method === 'moore') {
    if (r.round) out.round = r.round;
    if (Object.keys(r.block).length) out.blocks = count(r.block);
  } else {
    if (r.pass) out.pass = r.pass;
    if (r.refining) out.marked = Object.keys(r.marked).length;
    if (r.min) out.blocks = r.min.states.length;
  }
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Why an automaton is not a DFA, or null. */
export function notDfa(a: Automaton): string | null {
  const eps = a.moves.find((m) => m.on === 'ε');
  if (eps)
    return `That is an NFA: ${eps.from} has an ε-move. Turn it into a DFA first, with the subset construction.`;
  for (const m of a.moves) {
    const two = a.moves.filter((n) => n.from === m.from && n.on === m.on);
    if (two.length > 1)
      return `That is an NFA: ${m.from} has ${two.length} moves on ${m.on}. Turn it into a DFA first, with the subset construction.`;
  }
  return null;
}

const minimizeOp: Op = {
  label: 'Minimize',
  arity: 0,
  *run(s, _args, { settings }) {
    const dfa = s.dfa;
    const r: MinRun = {
      method: settings.method,
      work: dfa,
      dropping: [],
      block: {},
      round: 0,
      sig: {},
      marked: {},
      pass: 0,
      refining: false,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): MinStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(r),
      extra: { run: clone(r) },
    });

    // 1. A dead state for the missing moves.
    if (isComplete(dfa)) {
      yield step(
        `Every state has a move on every symbol, so the DFA is complete: no dead state is needed.`,
        ['complete'],
        2,
      );
    } else {
      const full = complete(dfa);
      const dead = full.states.find((q) => !dfa.states.includes(q))!;
      const added = full.moves.filter(
        (m) => !dfa.moves.some((d) => d.from === m.from && d.on === m.on),
      );
      const shown = added.filter((m) => m.from !== dead);
      r.work = full;
      r.added = dead;
      const missing = shown
        .slice(0, 3)
        .map((m) => `${m.from} on ${m.on}`)
        .join(', ');
      yield step(
        `Some moves are missing (${missing}${shown.length > 3 ? ', and more' : ''}). Minimizing needs a move for every state and symbol, so add a dead state, ${dead}, that never accepts and loops on every symbol, and send the ${plural(shown.length, 'missing move')} there.`,
        ['complete'],
        2,
        [
          mark(stateId(dead), 'new'),
          ...[...new Set(added.map((m) => moveId(m.from, m.to)))].map((id) => mark(id, 'new')),
        ],
      );
    }

    // 2. Drop the states the start never reaches.
    const keep = reachable(r.work);
    const drop = r.work.states.filter((q) => !keep.includes(q));
    if (drop.length) {
      r.dropping = drop;
      yield step(
        `No word takes ${dfa.start} to ${words(drop)}: no move from a reachable state leads there. ${drop.length === 1 ? 'It plays' : 'They play'} no part in what the DFA accepts, so drop ${drop.length === 1 ? 'it' : 'them'}.`,
        ['reach'],
        2,
        drop.map((q) => mark(stateId(q), 'remove')),
      );
      r.dropping = [];
      r.work = makeAutomaton({
        ...r.work,
        states: keep,
        accept: r.work.accept.filter((q) => keep.includes(q)),
        moves: r.work.moves.filter((m) => keep.includes(m.from)),
      });
    } else {
      yield step(`Every state can be reached from ${dfa.start}, so none is dropped.`, ['reach'], 2);
    }

    const w = r.work;
    const Q = w.states;
    r.refining = true;
    const F = Q.filter((q) => w.accept.includes(q));
    const N = Q.filter((q) => !w.accept.includes(q));

    if (r.method === 'moore') {
      for (const q of Q) r.block[q] = w.accept.includes(q) && N.length ? 2 : 1;
      yield step(
        F.length && N.length
          ? `Start with two blocks: the states that do not accept (block 1: ${words(N)}) and those that do (block 2: ${words(F)}). The empty word already tells a state of one from a state of the other.`
          : `${F.length ? 'Every state accepts' : 'No state accepts'}, so start with one block holding all of them.`,
        ['init'],
        2,
        Q.map((q) => mark(sigCell(q, 'block'), 'new')),
      );
      for (;;) {
        r.round++;
        r.sig = {};
        for (const q of Q) {
          r.q = q;
          const to = w.alphabet.map((c) => delta(w, q, c));
          r.sig[q] = to.map((t) => r.block[t]!);
          yield step(
            w.alphabet.length
              ? `Round ${r.round}, ${q} (block ${r.block[q]}): ${w.alphabet.map((c, i) => `on ${c} to ${to[i]}, in block ${r.block[to[i]!]}`).join('; ')}. Its signature is (${r.sig[q]!.join(', ')}).`
              : `Round ${r.round}, ${q} (block ${r.block[q]}): there are no symbols, so its signature is empty.`,
            ['round', 'signature'],
            3,
            [
              mark(stateId(q), 'active'),
              mark(sigCell(q, 'name'), 'active'),
              ...[...new Set(to)].map((t) => mark(moveId(q, t), 'active')),
              ...w.alphabet.map((c) => mark(sigCell(q, c), 'new')),
            ],
          );
        }
        r.q = undefined;
        const sigOf = (q: string) => `${r.block[q]}|${r.sig[q]!.join(',')}`;
        const blocks = [...new Set(Q.map((q) => r.block[q]!))].sort((a, b) => a - b);
        const splits = blocks.filter(
          (b) => new Set(Q.filter((q) => r.block[q] === b).map(sigOf)).size > 1,
        );
        if (!splits.length) {
          yield step(
            `Round ${r.round}: in every block, all states have the same signature, so nothing splits. The partition is stable: ${plural(count(r.block), 'block')}, and states in one block can never be told apart.`,
            ['round', 'stable'],
            1,
          );
          break;
        }
        const groupsOf = (b: number) => {
          const groups = new Map<string, string[]>();
          for (const q of Q.filter((x) => r.block[x] === b))
            groups.set(sigOf(q), [...(groups.get(sigOf(q)) ?? []), q]);
          return [...groups.values()];
        };
        const tell = splits.map(
          (b) =>
            `block ${b}: ${groupsOf(b)
              .map(
                (g) =>
                  `${words(g)} ${g.length === 1 ? 'has' : 'have'} (${r.sig[g[0]!]!.join(', ')})`,
              )
              .join('; ')}`,
        );
        // The part holding the block's first state keeps its number; the others move.
        const movers = splits.flatMap((b) => groupsOf(b).slice(1));
        yield step(
          `Round ${r.round}: some blocks disagree. In ${tell.join('. In ')}. States with different signatures can be told apart, so they split.`,
          ['round', 'split'],
          2,
          movers.flat().map((q) => mark(sigCell(q, 'name'), 'active')),
        );
        let next = Math.max(...blocks);
        const moved: string[] = [];
        const block = { ...r.block };
        for (const g of movers) {
          next++;
          for (const q of g) {
            block[q] = next;
            moved.push(q);
          }
        }
        r.block = block;
        yield step(
          `${words(moved)} ${moved.length === 1 ? 'moves' : 'move'} to ${splits.length === 1 && moved.every((q) => block[q] === block[moved[0]!]) ? `a new block, ${block[moved[0]!]}` : 'new blocks'}. That makes ${plural(count(r.block), 'block')}. Blocks changed, so do another round: a signature may now point into a new block.`,
          ['split'],
          1,
          moved.flatMap((q) => [mark(stateId(q), 'new'), mark(sigCell(q, 'block'), 'new')]),
        );
      }
    } else {
      // Table filling.
      for (let i = 0; i < Q.length; i++)
        for (let j = 0; j < i; j++)
          if (w.accept.includes(Q[i]!) !== w.accept.includes(Q[j]!))
            r.marked[pairKey(Q, Q[i]!, Q[j]!)] = 'ε';
      const pairs = (Q.length * (Q.length - 1)) / 2;
      const first = Object.keys(r.marked).length;
      yield step(
        Q.length < 2
          ? 'There is only one state, so there are no pairs to tell apart.'
          : first
            ? `There are ${plural(pairs, 'pair')} of states. Mark the ${plural(first, 'pair')} where one state accepts and the other does not: the empty word ε tells them apart.`
            : `There are ${plural(pairs, 'pair')} of states, and ${F.length ? 'every state accepts' : 'no state accepts'}, so ε separates none of them. Nothing is marked yet.`,
        ['init'],
        2,
        Object.keys(r.marked).map((k) => {
          const [p, q] = k.split('|') as [string, string];
          return mark(pairCell(Q, p, q), 'new');
        }),
      );
      while (Q.length >= 2) {
        r.pass++;
        let marked = 0;
        for (let i = 1; i < Q.length; i++)
          for (let j = 0; j < i; j++) {
            const p = Q[j]!;
            const q = Q[i]!;
            if (r.marked[pairKey(Q, p, q)]) continue;
            r.pair = [p, q];
            const base = [
              mark(stateId(p), 'compare'),
              mark(stateId(q), 'compare'),
              mark(pairCell(Q, p, q), 'active'),
            ];
            const hit = w.alphabet.find((c) => {
              const [x, y] = [delta(w, p, c), delta(w, q, c)];
              return x !== y && r.marked[pairKey(Q, x, y)];
            });
            const go = (c: string) => `on ${c} to ${delta(w, p, c)} and ${delta(w, q, c)}`;
            if (hit) {
              const [x, y] = [delta(w, p, hit), delta(w, q, hit)];
              r.marked[pairKey(Q, p, q)] = hit;
              marked++;
              yield step(
                `Pass ${r.pass}, the pair ${p}, ${q}: ${go(hit)}. That pair is marked, so a word starting with ${hit} tells ${p} and ${q} apart. Mark them with ${hit}.`,
                ['pass', 'pair', 'check', 'mark'],
                2,
                [
                  mark(stateId(x), 'visit'),
                  mark(stateId(y), 'visit'),
                  ...base,
                  mark(pairCell(Q, p, q), 'new'),
                  mark(pairCell(Q, x, y), 'found'),
                ],
              );
            } else {
              const to = w.alphabet.map((c) => [delta(w, p, c), delta(w, q, c)] as const);
              yield step(
                w.alphabet.length
                  ? `Pass ${r.pass}, the pair ${p}, ${q}: ${w.alphabet.map(go).join('; ')}. ${to.every(([x, y]) => x === y) ? 'Every symbol leads both to the same state' : 'None of those pairs is marked'}, so leave it for now.`
                  : `Pass ${r.pass}, the pair ${p}, ${q}: there are no symbols to follow, so leave it.`,
                ['pass', 'pair', 'check'],
                3,
                [
                  ...to
                    .filter(([x, y]) => x !== y)
                    .map(([x, y]) => mark(pairCell(Q, x, y), 'compare')),
                  ...base,
                ],
              );
            }
          }
        r.pair = undefined;
        yield step(
          marked
            ? `Pass ${r.pass} marked ${plural(marked, 'pair')}. A newly marked pair can lead to others, so make another pass.`
            : `Pass ${r.pass} marked nothing, so no more pairs can ever be marked. The ${plural(pairs - Object.keys(r.marked).length, 'pair')} left blank cannot be told apart by any word.`,
          ['pass', ...(marked ? [] : ['stable'])],
          1,
        );
        if (!marked) break;
      }
      r.block = renumber(Q, (p, q) => !r.marked[pairKey(Q, p, q)]);
    }

    // The minimal DFA.
    const { dfa: min, blocks } = merge(w, r.block);
    r.min = min;
    r.blocks = blocks;
    const merged = Object.values(blocks).filter((b) => b.length > 1);
    const lost = dfa.states.length - min.states.length;
    yield step(
      `Each block becomes one state, named after its first state: the minimal DFA has ${plural(min.states.length, 'state')}${lost > 0 ? `, ${lost} fewer than the DFA loaded` : lost < 0 ? ', one more than the DFA loaded, for its dead state' : ', as many as the DFA loaded'}.${merged.length ? ` ${merged.map((b) => `${words(b)} ${b.length === 2 ? 'both' : 'all'} become ${b[0]}`).join('; ')}.` : ' No two states were equivalent.'}`,
      ['build'],
      1,
    );
    return s;
  },
};

const load = loadAutomatonOp<S, MinSettings, X>({
  what: 'DFA',
  get: (s) => s.dfa,
  make: (dfa) => ({ dfa }),
  check: notDfa,
  ready: (a) =>
    isComplete(a)
      ? 'Press Minimize to merge the states no word can tell apart.'
      : 'Some moves are missing; Minimize will send them to a dead state first.',
  vars: (s) => dfaVars(s.dfa),
});

export const ops = { load, minimize: minimizeOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: MinSettings): PseudoBlock[] {
  const head = [
    L('sig', 0, 'MINIMIZE(D)', 'To shrink the DFA D:'),
    L('complete', 1, 'add a dead state if needed', 'send missing moves to a dead state;'),
    L('reach', 1, 'drop states q0 cannot reach', 'remove the states no word reaches.'),
  ];
  if (settings.method === 'table')
    return [
      {
        op: 'minimize',
        lines: [
          ...head,
          L('init', 1, 'mark {p, q} if p ∈ F xor q ∈ F', 'Mark pairs of accept and non-accept.'),
          L('pass', 1, 'repeat', 'Repeat:'),
          L('pair', 2, 'for each unmarked {p, q}', 'for each pair not marked yet,'),
          L(
            'check',
            3,
            'if some {δ(p,c), δ(q,c)} is marked',
            'if a symbol leads to a marked pair,',
          ),
          L('mark', 4, 'mark {p, q} with c', 'mark this pair too, with that symbol.'),
          L('stable', 1, 'until a pass marks nothing', 'Stop when a pass marks nothing.'),
          L('build', 1, 'merge unmarked pairs', 'Pairs left unmarked become one state.'),
        ],
      },
    ];
  return [
    {
      op: 'minimize',
      lines: [
        ...head,
        L('init', 1, 'P = { Q − F, F }', 'Start with two blocks: accept, and not.'),
        L('round', 1, 'repeat', 'Repeat:'),
        L(
          'signature',
          2,
          'sig(q) = (P[δ(q, c)] for c ∈ Σ)',
          'note which block each move leads to;',
        ),
        L('split', 2, 'split blocks by signature', 'split states that disagree.'),
        L('stable', 1, 'until no block splits', 'Stop when nothing splits.'),
        L('build', 1, 'each block becomes a state', 'Each block becomes one state.'),
      ],
    },
  ];
}

export function describeMoves(a: Automaton): string {
  if (!a.moves.length) return 'It has no moves.';
  return `Moves: ${a.moves.map((m) => `${m.from} on ${m.on} to ${m.to}`).join('; ')}.`;
}

export function describe(s: S): string {
  const a = s.dfa;
  return `The DFA: ${a.states.length} states (start ${a.start}, ${a.accept.length ? `accept ${a.accept.join(', ')}` : 'no accept states'}). ${describeMoves(a)}`;
}

export function describeRun(r: MinRun): string {
  const parts = [
    `Minimizing by ${r.method === 'moore' ? 'partition refinement' : 'table filling'}.`,
  ];
  if (r.method === 'moore' && Object.keys(r.block).length) {
    const blocks = new Map<number, string[]>();
    for (const q of r.work.states) blocks.set(r.block[q]!, [...(blocks.get(r.block[q]!) ?? []), q]);
    parts.push(
      `Blocks: ${[...blocks]
        .sort((a, b) => a[0] - b[0])
        .map(([b, qs]) => `${b}: ${qs.join(', ')}`)
        .join('; ')}.`,
    );
  }
  if (r.method === 'table') {
    const m = Object.entries(r.marked).map(([k, c]) => `${k.replace('|', ' and ')} by ${c}`);
    parts.push(m.length ? `Marked pairs: ${m.join('; ')}.` : 'No pairs marked.');
  }
  if (r.min && r.blocks)
    parts.push(
      `The minimal DFA has ${r.min.states.length} states: ${Object.entries(r.blocks)
        .map(([b, qs]) => `${b} (${qs.join(', ')})`)
        .join(', ')}.`,
    );
  return parts.join(' ');
}

export function initialSay(s: S): string {
  return `A DFA with ${s.dfa.states.length} states. Press Minimize to find the smallest DFA that accepts the same words.`;
}

export function initialVars(s: S) {
  return dfaVars(s.dfa);
}
