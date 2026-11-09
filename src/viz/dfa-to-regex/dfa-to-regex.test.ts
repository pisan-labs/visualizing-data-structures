import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { accepts, makeAutomaton, type Automaton } from '../_automata/automaton';
import { formatAutomaton, parseAutomaton } from '../_automata/parse';
import { randomDfa } from '../_automata/random';
import { matches, parseRegex, thompson, type Regex } from '../_automata/regex';
import { dfaToRegex } from '.';
import {
  EMPTY,
  concat,
  label,
  show,
  size,
  star,
  toRegex,
  union,
  weight,
  type Gnfa,
  type Order,
  type Simplify,
} from './gnfa';
import { MAX_TEXT, dry, loadCheck, type DrRun, type DrSettings } from './model';
import { allWords } from './practice';
import { countA, endsWith, startsWith } from './presets';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

const SETTINGS: DrSettings[] = (['name', 'fewest'] as Order[]).flatMap((order) =>
  (['identities', 'none'] as Simplify[]).map((simplify) => ({ order, simplify })),
);

function convert(dfa: Automaton, settings: DrSettings) {
  const t = new Timeline(dfaToRegex, settings, 1, [['load', formatAutomaton(dfa)], ['convert']]);
  const loaded = t.endState().dfa;
  const refused = t.entries[0]!.steps[0]!.say.startsWith('Nothing loaded');
  const steps = t.entries.at(-1)!.steps;
  const runs = steps.map((s) => s.extra?.run).filter((r): r is DrRun => !!r);
  return { loaded, steps, runs, refused };
}

/** A regex read back from a label's text, to check the printing (∪ read as |, any length). */
const reparse = (text: string): Regex => {
  const r = parseRegex(text.replace(/∪/g, '|'), { max: Infinity });
  if (r instanceof Error) throw r;
  return r;
};

/**
 * Does the GNFA accept w? A direct reference: the positions reached in w at each state, grown
 * along every arrow whose label matches the piece of w it reads, until nothing changes.
 */
function gnfaAccepts(g: Gnfa, w: string): boolean {
  const reach = new Map<string, Set<number>>(g.states.map((q) => [q, new Set<number>()]));
  reach.get(g.start)!.add(0);
  for (let changed = true; changed;) {
    changed = false;
    for (const a of g.arrows)
      for (const i of [...reach.get(a.from)!])
        for (let j = i; j <= w.length; j++)
          if (!reach.get(a.to)!.has(j) && matches(a.r, w.slice(i, j))) {
            reach.get(a.to)!.add(j);
            changed = true;
          }
  }
  return reach.get(g.accept)!.has(w.length);
}

const AB = ['a', 'b'];

/** Random DFAs from the shared kit: complete or partial, 1 to 5 states. */
const dfaArb = fc
  .record({ seed: fc.integer(), n: fc.integer({ min: 1, max: 5 }), partial: fc.boolean() })
  .map(({ seed, n, partial }) => randomDfa(makeRng(seed), n, { alphabet: AB, partial }));

/** Odd ones too: no accept state, states nothing reaches, a state with no moves at all. */
const STATES = ['q0', 'q1', 'q2', 'q3'];
const oddArb = fc
  .record({
    n: fc.integer({ min: 1, max: 4 }),
    to: fc.array(fc.integer({ min: -1, max: 3 }), { minLength: 8, maxLength: 8 }),
    accept: fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 3 }),
  })
  .map(({ n, to, accept }) =>
    makeAutomaton({
      states: STATES.slice(0, n),
      alphabet: [],
      start: 'q0',
      accept: accept.filter((i) => i < n).map((i) => STATES[i]!),
      moves: STATES.slice(0, n).flatMap((from, i) =>
        AB.map((on, k) => ({ on, t: to[i * 2 + k]! }))
          .filter(({ t }) => t >= 0 && t < n)
          .map(({ on, t }) => ({ from, on, to: STATES[t]! })),
      ),
    }),
  )
  .filter((d) => d.alphabet.length > 0);

describe('dfa-to-regex', () => {
  it('ends with an expression that accepts exactly the DFA’s words, in every setting', () => {
    fc.assert(
      fc.property(fc.oneof(dfaArb, oddArb), (dfa) => {
        const words = allWords(dfa.alphabet, 6);
        for (const settings of SETTINGS) {
          const { runs, loaded, refused } = convert(dfa, settings);
          if (refused) {
            // Load refused it: its labels grow too long in every setting.
            expect(loadCheck(dfa)).toMatch(/grow to \d+ characters/);
            for (const s of SETTINGS) expect(dry(dfa, s).maxText).toBeGreaterThan(MAX_TEXT);
            return;
          }
          expect(loaded).toEqual(dfa);
          if (!runs.length) {
            // Refused: the labels would grow past what the page can show.
            expect(dry(dfa, settings).maxText).toBeGreaterThan(MAX_TEXT);
            continue;
          }
          const last = runs.at(-1)!;
          expect(last.phase).toBe('done');
          expect(last.g.states).toEqual([last.g.start, last.g.accept]);
          const answer = last.answer!;
          const tree = label(last.g, last.g.start, last.g.accept)?.r ?? EMPTY;
          expect(show(tree)).toBe(answer);
          const again = reparse(answer);
          for (const w of words) {
            const want = accepts(dfa, w);
            expect(matches(tree, w), `${answer} on "${w}"`).toBe(want);
            expect(matches(again, w), `${answer} reparsed, on "${w}"`).toBe(want);
          }
          // The pure function gives the same expression and order.
          const pure = toRegex(dfa, settings);
          expect(show(pure.regex)).toBe(answer);
          expect(pure.order).toEqual(last.ripped);
        }
      }),
      { numRuns: 120 },
    );
  });

  it('converts correctly however long the labels get (the pure function, no display limit)', () => {
    const big = fc
      .record({ seed: fc.integer(), n: fc.integer({ min: 4, max: 6 }), partial: fc.boolean() })
      .map(({ seed, n, partial }) => randomDfa(makeRng(seed), n, { alphabet: AB, partial }));
    fc.assert(
      fc.property(big, fc.constantFrom(...SETTINGS), (dfa, settings) => {
        // Thompson's NFA runs in polynomial time, whatever the expression's shape.
        const { nfa } = thompson(toRegex(dfa, settings).regex);
        for (const w of allWords(AB, 5)) expect(accepts(nfa, w), w).toBe(accepts(dfa, w));
      }),
      { numRuns: 60 },
    );
  });

  it('refuses at Load a DFA whose labels grow too long in every setting', () => {
    const dfa = parseAutomaton(
      'start q0; accept q0 q1 q4; q0 a -> q1; q0 b -> q2; q1 a -> q2; q1 b -> q4; q2 a -> q3; q2 b -> q0; q3 a -> q1; q3 b -> q4; q4 a -> q0; q4 b -> q3',
    ) as Automaton;
    const { refused, loaded } = convert(dfa, dfaToRegex.defaults);
    expect(refused).toBe(true);
    expect(loaded).toEqual(dfaToRegex.init(dfaToRegex.defaults).dfa);
    expect(loadCheck(dfa)).toMatch(/even in the best order with simplification on/);
  });

  it('keeps the GNFA’s language and shape on every step', () => {
    fc.assert(
      fc.property(fc.oneof(dfaArb, oddArb), fc.constantFrom(...SETTINGS), (dfa, settings) => {
        // A DFA the Load refuses leaves the starting one in place: check whichever is loaded.
        const { steps, loaded } = convert(dfa, settings);
        const words = allWords(loaded.alphabet, 4);
        const simplify = settings.simplify === 'identities';
        const ripped: string[] = [];
        for (const st of steps) {
          const r = st.extra?.run;
          if (!r) continue;
          const g = r.g;
          // s first, f last, the DFA's states in between in name order, minus those ripped.
          expect(g.states[0]).toBe(g.start);
          expect(g.states.at(-1)).toBe(g.accept);
          expect(g.states.slice(1, -1)).toEqual(loaded.states.filter((q) => !r.ripped.includes(q)));
          // Nothing enters s and nothing leaves f; one arrow per pair once merged.
          for (const a of g.arrows) {
            expect(a.to).not.toBe(g.start);
            expect(a.from).not.toBe(g.accept);
            expect(g.states).toContain(a.from);
            expect(g.states).toContain(a.to);
            expect(a.text).toBe(r.phase === 'gnfa' ? a.text : show(a.r));
            if (simplify) {
              expect(a.text).not.toContain('∅');
              expect(a.text).not.toContain('ε*');
            }
          }
          if (r.phase !== 'gnfa') {
            const pairs = g.arrows.map((a) => `${a.from}>${a.to}`);
            expect(new Set(pairs).size).toBe(pairs.length);
          }
          // Every step accepts the DFA's words: a new label only adds paths that went through
          // the state being ripped.
          for (const w of words)
            expect(gnfaAccepts(g, w), `"${w}" at ${r.phase}`).toBe(accepts(loaded, w));
          expect(st.vars!.left).toBe(g.states.length - 2);
          expect(st.vars!.arrows).toBe(g.arrows.length);
          expect(st.vars!.size).toBe(g.arrows.reduce((n, a) => n + size(a.r), 0));
          if (r.phase === 'pick') {
            const left = g.states.slice(1, -1);
            if (settings.order === 'name') expect(r.rip).toBe(left[0]);
            else for (const q of left) expect(weight(g, r.rip!)).toBeLessThanOrEqual(weight(g, q));
          }
          if (r.phase === 'ripped') {
            ripped.push(r.ripped.at(-1)!);
            expect(r.ripped).toEqual(ripped);
          }
        }
        expect(ripped.length === loaded.states.length || steps.length === 1).toBe(true);
      }),
      { numRuns: 120 },
    );
  });

  it('writes each pair’s label by the rule R1(R2)*R3 ∪ R4', () => {
    fc.assert(
      fc.property(dfaArb, fc.constantFrom(...SETTINGS), (dfa, settings) => {
        const { runs } = convert(dfa, settings);
        const o = { simplify: settings.simplify === 'identities' };
        let before: Gnfa | undefined;
        for (const r of runs) {
          if (r.phase === 'pick') before = r.g;
          if (r.phase !== 'pair') continue;
          const g = before!;
          const q = r.rip!;
          const [p, x] = r.pair!;
          const R = (a: string, b: string) => label(g, a, b)?.r ?? EMPTY;
          const want = union(concat(concat(R(p, q), star(R(q, q), o), o), R(q, x), o), R(p, x), o);
          expect(label(r.g, p, x)!.text).toBe(show(want));
          expect(r.tags).toEqual({
            [`${p}>${q}`]: 'R1',
            [`${q}>${q}`]: 'R2',
            [`${q}>${x}`]: 'R3',
            [`${p}>${x}`]: 'R4',
          });
        }
      }),
      { numRuns: 100 },
    );
  });

  it('prints any expression so that it reads back the same', () => {
    const leaf = fc.constantFrom<Regex>(
      { kind: 'sym', c: 'a' },
      { kind: 'sym', c: 'b' },
      { kind: 'eps' },
      { kind: 'empty' },
    );
    const { tree } = fc.letrec<{ tree: Regex }>((tie) => ({
      tree: fc.oneof(
        { depthSize: 'small', withCrossShrink: true },
        leaf,
        fc.record({ kind: fc.constant('union' as const), a: tie('tree'), b: tie('tree') }),
        fc.record({ kind: fc.constant('concat' as const), a: tie('tree'), b: tie('tree') }),
        fc.record({ kind: fc.constant('star' as const), a: tie('tree') }),
      ) as fc.Arbitrary<Regex>,
    }));
    const words = allWords(AB, 5);
    fc.assert(
      fc.property(tree, (r) => {
        const again = reparse(show(r));
        for (const w of words)
          expect(matches(again, w), `${show(r)} on "${w}"`).toBe(matches(r, w));
      }),
      { numRuns: 300 },
    );
  });

  it('gives the expected answers on known DFAs', () => {
    const name: DrSettings = { order: 'name', simplify: 'identities' };
    const fewest: DrSettings = { order: 'fewest', simplify: 'identities' };
    const answer = (text: string | Automaton, s: DrSettings) =>
      show(toRegex(typeof text === 'string' ? (parseAutomaton(text) as Automaton) : text, s).regex);
    const containsB = 'start q1; accept q2; q1 a -> q1; q1 b -> q2; q2 a,b -> q2';
    expect(answer(containsB, name)).toBe('a*b(a∪b)*');
    expect(answer(containsB, { order: 'name', simplify: 'none' })).toBe('(εa*b∪∅)(a∪b)*ε∪∅');
    const div3 =
      'start q0; accept q0; q0 0 -> q0; q0 1 -> q1; q1 0 -> q2; q1 1 -> q0; q2 0 -> q1; q2 1 -> q2';
    expect(answer(div3, fewest)).toBe('(1(01*0)*1∪0)*');
    expect(answer(countA(2), fewest)).toBe('(ab*a∪b)*');
    expect(answer(startsWith('ab'), name)).toBe('ab(a∪b)*');
    expect(answer('start q0; q0 a -> q1; q1 a,b -> q0', name)).toBe('∅');
    // Name order makes the answer for divisible-by-3 several times longer.
    expect(size(toRegex(parseAutomaton(div3) as Automaton, name).regex)).toBeGreaterThan(
      3 * size(toRegex(parseAutomaton(div3) as Automaton, fewest).regex),
    );
    // Without simplifying, every label carries the ε and ∅ the rule reads.
    for (const w of ['ab', 'aba'])
      for (const s of SETTINGS) expect(matches(toRegex(endsWith(w), s).regex, `b${w}`)).toBe(true);
  });

  it('refuses an NFA and an oversized DFA when loading, and keeps the old DFA', () => {
    const before = dfaToRegex.init(dfaToRegex.defaults);
    const t = new Timeline(dfaToRegex, dfaToRegex.defaults, 1, [
      ['load', 'q0 a -> q1; q0 a -> q2; accept q1'],
      ['load', 'q0 a -> q1; q1 a -> q2; q2 a -> q3; q3 a -> q4; q4 a -> q5; q5 a -> q6; accept q6'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toContain('That is an NFA: q0 has 2 moves on a');
    expect(t.entries[1]!.steps[0]!.say).toContain('Use at most 6 states here');
    expect(t.endState()).toEqual(before);
  });

  it('asks practice questions whose answers check out against a reference', () => {
    const kinds = dfaToRegex.practice!;
    const kind = (id: string) => kinds.find((k) => k.id === id)!;
    const dfaOf = (q: { setup: unknown[][] }) =>
      parseAutomaton(String(q.setup[0]![1])) as Automaton;
    for (let seed = 1; seed <= 40; seed++) {
      // Which expression: exactly one option means the DFA's language.
      const a = kind('answer').make(makeRng(seed));
      const dfa = dfaOf(a);
      const words = allWords(dfa.alphabet, 6);
      if (a.answer.kind !== 'choice') throw new Error('choice expected');
      const right = a.answer.options.map((o) =>
        words.every((w) => matches(reparse(o), w) === accepts(dfa, w)),
      );
      expect(right.filter(Boolean).length).toBe(1);
      expect(right[a.answer.correct]).toBe(true);

      // The rip rule: exactly one option means what the correct one means.
      const n = kind('new-label').make(makeRng(seed));
      if (n.answer.kind !== 'choice') throw new Error('choice expected');
      const nd = dfaOf(n);
      const want = reparse(n.answer.options[n.answer.correct]!);
      const same = n.answer.options.filter((o) =>
        allWords(nd.alphabet, 6).every((w) => matches(reparse(o), w) === matches(want, w)),
      );
      expect(same).toHaveLength(1);

      // Fewest paths first: the order the pure function finds.
      const f = kind('fewest-order').make(makeRng(seed));
      if (f.answer.kind !== 'sequence') throw new Error('sequence expected');
      expect(f.answer.value).toEqual(
        toRegex(dfaOf(f), { order: 'fewest', simplify: 'identities' }).order,
      );
    }
  });
});

describe('drawn text size', () => {
  // On a phone the GNFA runs down with the table beside it, its labels wrapped shorter: 8.9 px
  // with the layers 150 apart, 9.3 with them 120 apart.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dfaToRegex, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dfaToRegex, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
