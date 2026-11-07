/**
 * DFA to regular expression by state elimination (Sipser, Lemma 1.60). Convert turns the DFA
 * into a GNFA: a new start state s with an ε-arrow to the old start, a new accept state f with
 * an ε-arrow from every old accept state, and one arrow per pair of states, the symbols of
 * parallel moves united (a,b becomes a∪b). Then it rips out one state at a time. Ripping q
 * gives every pair (p, r) with an arrow p → q and an arrow q → r the label
 *
 *   R1(R2)*R3 ∪ R4,   R1 = p → q, R2 = the loop on q, R3 = q → r, R4 = p → r
 *
 * (∅ where there is no arrow), so every path through q now skips it. When only s and f are
 * left, the label from s to f is the answer.
 *
 * Settings:
 * - `order`: rip the states in name order (the default, as Sipser's examples do), or rip the
 *   state with the fewest paths through it (arrows in × arrows out) first. The order changes
 *   the size of the answer, often a lot, but never its language.
 * - `simplify`: 'identities' (the default) applies R∅ = ∅, Rε = R, R ∪ ∅ = R, ε* = ε and
 *   ∅* = ε as labels are built, as Sipser does in his examples; 'none' writes the rule exactly,
 *   ∅* and ∪∅ included.
 *
 * The state is just the DFA. A run's GNFA travels in the steps' `extra`, so a practice picture
 * draws the DFA and the last step shows the answer.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import type { Automaton } from '../_automata/automaton';
import { parseAutomaton } from '../_automata/parse';
import { describeMachine, loadOp, plural, whyNotDfa, words } from '../_automata/page';
import type { Regex } from '../_automata/regex';
import {
  drop,
  inner,
  label,
  makeGnfa,
  merge,
  pairs,
  parallel,
  paths,
  pickRip,
  setLabel,
  show,
  size,
  update,
  weight,
  type Arrow,
  type Gnfa,
  type Order,
  type Simplify,
} from './gnfa';

export interface DfaState {
  dfa: Automaton;
}

export interface DrSettings {
  [key: string]: Scalar;
  order: Order;
  simplify: Simplify;
}

export const defaults: DrSettings = { order: 'name', simplify: 'identities' };

/** The most DFA states this page takes: with s and f, eight states to draw. */
export const MAX_DFA_STATES = 6;
/**
 * The most text the labels may hold at once, in characters: the label table has to fit on the
 * stage. A DFA whose labels grow past it with the chosen settings is not converted.
 */
export const MAX_TEXT = 300;

/** Even b's after the first a: a dead-free DFA whose answer shows a star inside a star. */
export const START_TEXT =
  'start q0; accept q1; q0 b -> q0; q0 a -> q1; q1 a -> q1; q1 b -> q2; q2 b -> q1; q2 a -> q2';

export type Phase = 'gnfa' | 'merged' | 'pick' | 'parts' | 'pair' | 'ripped' | 'done';

/** Which of R1 to R4 an arrow is, in the pair being worked on. */
export type Tag = 'R1' | 'R2' | 'R3' | 'R4';

export interface DrRun {
  phase: Phase;
  /** The GNFA as it stands. */
  g: Gnfa;
  /** The state being ripped, and the pair being updated. */
  rip?: string;
  pair?: [string, string];
  /** Arrow keys (`${p}>${q}`) of the pair's R1 to R4. */
  tags: Record<string, Tag>;
  /** Labels the table shows as ∅ for now: R2 or R4 when there is no such arrow. */
  ghosts: [string, string][];
  /** Pairs rewritten while ripping the current state. */
  updated: [string, string][];
  /** States ripped so far, in order. */
  ripped: string[];
  /** Labels rewritten so far. */
  rewrites: number;
  /** At the end: the answer. */
  answer?: string;
}

export interface DrExtra {
  run?: DrRun;
}

type S = DfaState;
type X = DrExtra;
type DrStep = Step<S, X>;
type Op = OpSpec<S, DrSettings, X>;

export function init(): S {
  return { dfa: parseAutomaton(START_TEXT) as Automaton };
}

export const arrowKey = (p: string, q: string) => `${p}>${q}`;
/** Shape ids of the label table (see view.ts). */
export const rowId = (p: string, q: string) => `lab-${p}-${q}`;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** An arrow's marks: on the diagram (when it is drawn) and in the table. */
function arrowMarks(g: Gnfa, p: string, q: string, role: Mark['role']): Mark[] {
  const out = [mark(rowId(p, q), role)];
  if (label(g, p, q)) out.unshift(mark(moveId(p, q), role));
  return out;
}

export function dfaVars(dfa: Automaton): Record<string, Scalar> {
  return { '|Q|': dfa.states.length, '|Σ|': dfa.alphabet.length };
}

/** Σ of the labels' sizes: what the answer grows from. */
const totalSize = (g: Gnfa) => g.arrows.reduce((n, a) => n + size(a.r), 0);

function runVars(dfa: Automaton, r: DrRun): Record<string, Scalar> {
  return {
    ...dfaVars(dfa),
    left: inner(r.g).length,
    arrows: r.g.arrows.length,
    rewrites: r.rewrites,
    size: totalSize(r.g),
  };
}

/** The text of a label in narration: ∅ for no arrow. */
const text = (x: Regex) => show(x);

/** "q0 → q1". */
export const arrowText = (p: string, q: string) => `${p} → ${q}`;

// ---------------------------------------------------------------------------------------------
// A dry run: how large the labels grow with these settings, before drawing anything

export interface Dry {
  /** The most label text at any step, in characters. */
  maxText: number;
  answer: Regex | undefined;
  order: string[];
}

const textOf = (g: Gnfa) => g.arrows.reduce((n, a) => n + a.text.length, 0);

export function dryRun(dfa: Automaton, s: DrSettings): Dry {
  const simplify = s.simplify === 'identities';
  let g = merge(makeGnfa(dfa), { simplify });
  let maxText = textOf(g);
  const order: string[] = [];
  while (inner(g).length) {
    const q = pickRip(g, s.order);
    order.push(q);
    let h = g;
    for (const [p, r] of pairs(g, q)) {
      h = setLabel(h, p, r, update(g, q, p, r, simplify).out);
      maxText = Math.max(maxText, textOf(h));
    }
    g = drop(h, q);
  }
  return { maxText, answer: label(g, g.start, g.accept)?.r, order };
}

const dryCache = new Map<string, Dry>();

export function dry(dfa: Automaton, s: DrSettings): Dry {
  const key = `${s.order}|${s.simplify}|${dfa.start}|${dfa.accept.join(',')}|${dfa.moves.map((m) => `${m.from}>${m.on}>${m.to}`).join(',')}|${dfa.states.join(',')}`;
  let hit = dryCache.get(key);
  if (!hit) {
    hit = dryRun(dfa, s);
    if (dryCache.size > 200) dryCache.clear();
    dryCache.set(key, hit);
  }
  return hit;
}

const ALL: DrSettings[] = [
  { order: 'fewest', simplify: 'identities' },
  { order: 'name', simplify: 'identities' },
  { order: 'fewest', simplify: 'none' },
  { order: 'name', simplify: 'none' },
];

/** Why this machine cannot be loaded here, or null. */
export function loadCheck(a: Automaton): string | null {
  const why = whyNotDfa(a);
  if (why) return `That is an NFA: ${why}. This page starts from a DFA.`;
  if (a.states.length > MAX_DFA_STATES)
    return `Use at most ${MAX_DFA_STATES} states here: the expressions grow too long to show.`;
  const best = Math.min(...ALL.map((s) => dry(a, s).maxText));
  if (best > MAX_TEXT)
    return `Its labels grow to ${best} characters even in the best order with simplification on, too long to show. Use fewer states or moves.`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Convert

const ORDER_TEXT: Record<Order, string> = {
  name: 'name order',
  fewest: 'fewest paths first',
};

function pickSay(g: Gnfa, q: string, order: Order, first: boolean): string {
  const left = inner(g);
  const t = paths(g, q);
  const w = t.ins.length * t.outs.length;
  let why: string;
  if (order === 'name')
    why = first
      ? `Rip out ${q}, the first state in name order.`
      : `Rip out ${q}, the next state in name order.`;
  else {
    const others = left.filter((x) => x !== q).map((x) => `${x}: ${weight(g, x)}`);
    why =
      `Rip out ${q}: ${t.ins.length} ${t.ins.length === 1 ? 'arrow' : 'arrows'} in × ${t.outs.length} out = ${w} ${w === 1 ? 'path' : 'paths'} through it, the fewest` +
      (others.length ? ` (${others.join(', ')}).` : '.');
  }
  const loop = t.loop
    ? `Its loop is ${t.loop.text}, so R2 = ${t.loop.text}.`
    : 'It has no loop, so R2 = ∅.';
  if (!w) {
    const none = !t.ins.length ? `No arrow enters ${q}` : `No arrow leaves ${q} for another state`;
    return `${why} ${none}, so no path runs through it: ripping it just deletes it and its arrows.`;
  }
  return `${why} ${loop} Arrows come in from ${words(t.ins)} and go out to ${words(t.outs)}: ${plural(w, 'label')} to rewrite.`;
}

function partsSay(u: ReturnType<typeof update>, q: string): string {
  const { from: p, to: r } = u;
  const r4 =
    u.R4.kind === 'empty'
      ? `R4 = ∅: there is no arrow ${arrowText(p, r)} yet`
      : `R4 = ${text(u.R4)} (${arrowText(p, r)})`;
  const r2 = u.R2.kind === 'empty' ? 'R2 = ∅ (no loop)' : `R2 = ${text(u.R2)} (the loop)`;
  return `Pair ${p}, ${r}: R1 = ${text(u.R1)} (${arrowText(p, q)}), ${r2}, R3 = ${text(u.R3)} (${arrowText(q, r)}), and ${r4}.`;
}

function pairSay(u: ReturnType<typeof update>, simplify: boolean): string {
  const raw = show(u.raw);
  const out = show(u.out);
  const head = `New label ${arrowText(u.from, u.to)}: R1(R2)*R3 ∪ R4 = ${raw}`;
  if (!simplify) return `${head}, written exactly as the rule gives it.`;
  if (raw === out) return `${head}. Nothing simplifies.`;
  return `${head}, and ${words(u.used)} leave${u.used.length === 1 ? 's' : ''} ${out}.`;
}

const convert: Op = {
  label: 'Convert',
  arity: 0,
  *run(s, _args, { settings }) {
    const dfa = s.dfa;
    const simplify = settings.simplify === 'identities';
    const d = dry(dfa, settings);
    if (d.maxText > MAX_TEXT) {
      const best = ALL.map((x) => ({ x, n: dry(dfa, x).maxText })).reduce((a, b) =>
        b.n < a.n ? b : a,
      );
      const how = `${ORDER_TEXT[best.x.order]}${best.x.simplify === 'none' ? ' without simplification' : ', simplifying'}`;
      yield {
        state: s,
        marks: [],
        say: `In ${ORDER_TEXT[settings.order]}${simplify ? '' : ' without simplification'}, the labels of this DFA grow to ${d.maxText} characters, too long to show. In ${how}, they reach only ${best.n}: change the options and press Convert again. The order and the identities change how long the answer is, never what it matches.`,
        lines: [],
        level: 1,
        vars: dfaVars(dfa),
      };
      return s;
    }
    const r: DrRun = {
      phase: 'gnfa',
      g: makeGnfa(dfa),
      tags: {},
      ghosts: [],
      updated: [],
      ripped: [],
      rewrites: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): DrStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(dfa, r),
      extra: {
        run: {
          ...r,
          tags: { ...r.tags },
          ghosts: [...r.ghosts],
          updated: [...r.updated],
          ripped: [...r.ripped],
        },
      },
    });

    // 1. A new start and accept state.
    const g0 = r.g;
    const sName = g0.start;
    const fName = g0.accept;
    const acc = dfa.accept.length
      ? `a new accept state ${fName}, with an ε-arrow from ${dfa.accept.length === 1 ? 'the accept state' : 'each accept state'} (${words(dfa.accept)}). Now ${fName} is the only accept state`
      : `a new accept state ${fName}. The DFA has no accept states, so no arrow enters ${fName}: it accepts nothing, and the answer will be ∅`;
    const parallelPairs = parallel(g0);
    yield step(
      `Add a new start state ${sName}, with an ε-arrow to ${dfa.start}, and ${acc}. Nothing enters ${sName} and nothing leaves ${fName}. A pair with no arrow has the label ∅: no word goes that way.${parallelPairs.length ? '' : ' No two moves join the same pair, so every arrow has one label already.'}`,
      ['new', 'acc'],
      2,
      [
        mark(stateId(sName), 'new'),
        mark(stateId(fName), 'new'),
        ...arrowMarks(g0, sName, dfa.start, 'new'),
        ...dfa.accept.flatMap((q) => arrowMarks(g0, q, fName, 'new')),
      ],
    );

    // 2. Unite parallel moves.
    r.g = merge(g0, { simplify });
    if (parallelPairs.length) {
      r.phase = 'merged';
      const [p, q] = parallelPairs[0]!;
      const more = parallelPairs.length - 1;
      const syms = g0.arrows.filter((a) => a.from === p && a.to === q).map((a) => a.text);
      yield step(
        `Unite moves that join the same pair: ${arrowText(p, q)} on ${words(syms).replace(' and ', ' or ')} becomes one arrow labeled ${label(r.g, p, q)!.text}${more ? ` (and ${plural(more, 'other pair')} the same way)` : ''}. Now there is one arrow per pair.`,
        ['merge'],
        2,
        parallelPairs.flatMap(([x, y]) => arrowMarks(r.g, x, y, 'new')),
      );
    }

    // 3. Rip out the DFA's states, one at a time.
    let first = true;
    while (inner(r.g).length) {
      const g = r.g;
      const q = pickRip(g, settings.order);
      const t = paths(g, q);
      r.phase = 'pick';
      r.rip = q;
      r.pair = undefined;
      r.tags = {};
      r.ghosts = [];
      r.updated = [];
      yield step(pickSay(g, q, settings.order, first), ['while', 'pick'], 2, [
        mark(stateId(q), 'remove'),
        ...t.ins.flatMap((p) => arrowMarks(g, p, q, 'compare')),
        ...t.outs.flatMap((x) => arrowMarks(g, q, x, 'compare')),
        ...(t.loop ? arrowMarks(g, q, q, 'compare') : []),
      ]);
      first = false;
      for (const [p, x] of pairs(g, q)) {
        const u = update(g, q, p, x, simplify);
        r.pair = [p, x];
        r.tags = {
          [arrowKey(p, q)]: 'R1',
          [arrowKey(q, q)]: 'R2',
          [arrowKey(q, x)]: 'R3',
          [arrowKey(p, x)]: 'R4',
        };
        r.ghosts = [
          ...(t.loop ? [] : [[q, q] as [string, string]]),
          ...(label(r.g, p, x) ? [] : [[p, x] as [string, string]]),
        ];
        r.phase = 'parts';
        const partMarks = (g2: Gnfa) => [
          mark(stateId(q), 'remove'),
          ...arrowMarks(g2, p, q, 'compare'),
          ...arrowMarks(g2, q, q, 'compare'),
          ...arrowMarks(g2, q, x, 'compare'),
        ];
        yield step(partsSay(u, q), ['pair', 'parts', 'parts2'], 3, [
          ...partMarks(r.g),
          ...arrowMarks(r.g, p, x, 'active'),
        ]);
        r.g = setLabel(r.g, p, x, u.out);
        r.ghosts = r.ghosts.filter(([a, b]) => !(a === p && b === x));
        r.phase = 'pair';
        r.rewrites++;
        r.updated.push([p, x]);
        yield step(pairSay(u, simplify), ['rule', ...(simplify ? ['simplify'] : [])], 2, [
          ...partMarks(r.g),
          ...arrowMarks(r.g, p, x, 'new'),
        ]);
      }
      r.g = drop(r.g, q);
      r.ripped.push(q);
      r.phase = 'ripped';
      r.pair = undefined;
      r.tags = {};
      r.ghosts = [];
      const left = inner(r.g);
      const n = r.updated.length;
      yield step(
        `${q} is gone, with its arrows.${n ? ` Every path through it now runs on the ${n === 1 ? 'new label' : `${n} new labels`}.` : ''} ${left.length ? `Left between ${sName} and ${fName}: ${words(left)}.` : `Only ${sName} and ${fName} are left.`}`,
        ['remove'],
        1,
        r.updated.flatMap(([p, x]) => arrowMarks(r.g, p, x, 'new')),
      );
    }

    // 4. The answer.
    const ans = label(r.g, sName, fName);
    r.phase = 'done';
    r.rip = undefined;
    r.updated = [];
    r.answer = ans ? ans.text : '∅';
    const m = ans ? size(ans.r) : 1;
    yield step(
      ans
        ? `The label on ${arrowText(sName, fName)} is the answer: ${ans.text}. It matches exactly the words the DFA accepts. Its size is ${m} (symbols and operators), ripping in the order ${words(r.ripped)}.`
        : `No arrow joins ${sName} to ${fName}, so the answer is ∅: the DFA accepts no word at all.`,
      ['return'],
      1,
      ans ? arrowMarks(r.g, sName, fName, 'found') : [],
    );
    return s;
  },
};

const load = loadOp<S, DrSettings, X>({
  what: 'DFA',
  make: (dfa) => ({ dfa }),
  check: loadCheck,
  ready: () => 'Press Convert to turn it into a regular expression, one state at a time.',
  vars: (s) => dfaVars(s.dfa),
});

export const ops = { load, convert };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after Sipser's CONVERT(G). Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: DrSettings): PseudoBlock[] {
  const pick =
    settings.order === 'name'
      ? L('pick', 2, 'q = first state ≠ s, f', 'take the next state in name order;')
      : L(
          'pick',
          2,
          'q = state with fewest in × out',
          'take the one with the fewest paths through it;',
        );
  return [
    {
      op: 'convert',
      lines: [
        L('sig', 0, 'CONVERT(M)', 'To turn the DFA M into an expression:'),
        L('new', 1, 'add s, f; s →ε q0', 'add a new start s with ε to the old start,'),
        L('acc', 1, 'q →ε f for each q ∈ F', 'and a new accept f with ε from each accept state.'),
        L('merge', 1, 'unite parallel arrows with ∪', 'Join the symbols on one arrow with ∪.'),
        L('while', 1, 'while states ≠ s, f remain', 'While a state besides s and f is left:'),
        pick,
        L('pair', 2, 'for each p → q, q → r', 'for each arrow in and arrow out,'),
        L('parts', 3, 'R1 = p→q; R2 = q→q', 'read the label in, the loop,'),
        L(
          'parts2',
          3,
          'R3 = q→r; R4 = p→r',
          'the label out and the one that skips q (∅ for none);',
        ),
        L('rule', 3, 'p → r = R1(R2)*R3 ∪ R4', 'the new label skips q.'),
        ...(settings.simplify === 'identities'
          ? [
              L(
                'simplify',
                3,
                'simplify with ∅, ε identities',
                'Drop ∅ and ε where they change nothing.',
              ),
            ]
          : []),
        L('remove', 2, 'remove q', 'Then remove q.'),
        L('return', 1, 'return label(s → f)', 'The label from s to f is the answer.'),
      ],
    },
  ];
}

export function describeLabels(g: Gnfa): string {
  if (!g.arrows.length) return 'No arrows.';
  return `Arrows: ${g.arrows.map((a: Arrow) => `${a.from} to ${a.to} labeled ${a.text}`).join('; ')}.`;
}

export function describe(s: S): string {
  return `The DFA: ${describeMachine(s.dfa)} Moves: ${s.dfa.moves.map((m) => `${m.from} on ${m.on} to ${m.to}`).join('; ') || 'none'}.`;
}

/** The scene label during a run: the GNFA's states and labels. */
export function describeRun(r: DrRun): string {
  const what = r.answer ? ` The answer: ${r.answer}.` : '';
  return `The GNFA: states ${words(r.g.states)}, start ${r.g.start}, accept ${r.g.accept}. ${describeLabels(r.g)}${what}`;
}

export function initialSay(s: S): string {
  return `A DFA with ${plural(s.dfa.states.length, 'state')}. Press Convert to find a regular expression for the same language, ripping out one state at a time.`;
}

export function initialVars(s: S) {
  return dfaVars(s.dfa);
}
