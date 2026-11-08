import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { EPS, makeAutomaton, subsetConstruction, type Automaton } from '../_automata/automaton';
import { formatAutomaton } from '../_automata/parse';
import { nfaToDfa } from '.';
import { MAX_DFA, allSubsets, runDfa, type ConvRun, type NdSettings } from './model';
import { nthFromEnd } from './presets';

// ---------------------------------------------------------------------------------------------
// Reference: ε-closures and acceptance written from the definitions, apart from the kit.

function refClosure(a: Automaton, set: string[]): Set<string> {
  const out = new Set(set);
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of a.moves)
      if (m.on === EPS && out.has(m.from) && !out.has(m.to)) {
        out.add(m.to);
        grew = true;
      }
  }
  return out;
}

/** Does the NFA accept w? A search over configurations (state, symbols read). */
function refAccepts(a: Automaton, w: string): boolean {
  const seen = new Set<string>();
  const todo: [string, number][] = [[a.start, 0]];
  while (todo.length) {
    const [q, i] = todo.pop()!;
    const k = `${q}@${i}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (i === w.length && a.accept.includes(q)) return true;
    for (const m of a.moves) {
      if (m.from !== q) continue;
      if (m.on === EPS) todo.push([m.to, i]);
      else if (i < w.length && m.on === w[i]) todo.push([m.to, i + 1]);
    }
  }
  return false;
}

/** Does the DFA accept w? A missing move rejects. */
function runDfaOn(d: Automaton, w: string): boolean {
  let q: string | undefined = d.start;
  for (const c of w) q = d.moves.find((m) => m.from === q && m.on === c)?.to;
  return q !== undefined && d.accept.includes(q);
}

function allWords(symbols: string[], n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => symbols.map((c) => w + c));
    out.push(...level);
  }
  return out;
}

const STATES = ['q0', 'q1', 'q2', 'q3', 'q4'];

/** A random NFA over {a, b} with up to five states and some ε-moves. */
const nfaArb = fc
  .record({
    n: fc.integer({ min: 1, max: 5 }),
    moves: fc.array(
      fc.record({
        from: fc.integer({ min: 0, max: 4 }),
        on: fc.constantFrom('a', 'b', EPS),
        to: fc.integer({ min: 0, max: 4 }),
      }),
      { maxLength: 12 },
    ),
    accept: fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 3 }),
  })
  .map(({ n, moves, accept }) =>
    makeAutomaton({
      states: STATES.slice(0, n),
      alphabet: [],
      start: 'q0',
      accept: accept.filter((i) => i < n).map((i) => STATES[i]!),
      moves: moves
        .filter((m) => m.from < n && m.to < n)
        .map((m) => ({ from: STATES[m.from]!, on: m.on, to: STATES[m.to]! })),
    }),
  );

function convert(nfa: Automaton, settings: NdSettings = { subsets: 'reachable' }) {
  const t = new Timeline(nfaToDfa, settings, 1, [['load', formatAutomaton(nfa)], ['convert']]);
  const loaded = t.endState().nfa;
  const steps = t.entries.at(-1)!.steps;
  return { loaded, steps, run: steps.at(-1)!.extra?.run };
}

/** Invariants of a breadth-first run at every step. */
function checkStep(nfa: Automaton, r: ConvRun, vars: Record<string, unknown>) {
  const names = r.rows.map((row) => row.name);
  expect(new Set(names).size).toBe(names.length);
  const keys = r.rows.map((row) => row.set.join(','));
  expect(new Set(keys).size, 'each set is one DFA state').toBe(keys.length);
  for (const row of r.rows) {
    expect([...refClosure(nfa, row.set)].sort(), 'every DFA state is ε-closed').toEqual(
      [...row.set].sort(),
    );
    expect(r.accept.includes(row.name)).toBe(row.set.some((q) => nfa.accept.includes(q)));
  }
  for (const m of r.moves) {
    const from = r.rows.find((row) => row.name === m.from)!.set;
    const to = r.rows.find((row) => row.name === m.to)!.set;
    const reached = refClosure(
      nfa,
      nfa.moves.filter((x) => x.on === m.on && from.includes(x.from)).map((x) => x.to),
    );
    expect([...reached].sort(), `δ'(${m.from}, ${m.on})`).toEqual([...to].sort());
    expect([...r.done, r.T]).toContain(m.from);
  }
  // Breadth first: done states, then the one being worked on, then the queue, in row order.
  const working = r.T && !r.done.includes(r.T) ? [r.T] : [];
  expect([...r.done, ...working, ...r.queue]).toEqual(names);
  expect(vars.found).toBe(r.rows.length);
  expect(vars.queue).toBe(r.queue.length);
}

describe('nfa-to-dfa', () => {
  it('builds the DFA subsetConstruction() builds, checking every step on the way', () => {
    fc.assert(
      fc.property(nfaArb, (nfa) => {
        fc.pre(subsetConstruction(nfa).dfa.states.length <= MAX_DFA);
        const { loaded, steps, run } = convert(nfa);
        for (const st of steps) checkStep(loaded, st.extra!.run!, st.vars!);
        expect(run!.finished).toBe(true);
        expect(runDfa(loaded, run!)).toEqual(subsetConstruction(loaded));
        expect([...refClosure(loaded, [loaded.start])].sort()).toEqual(
          [...run!.rows[0]!.set].sort(),
        );
      }),
      { numRuns: 200 },
    );
  });

  it('builds a DFA that accepts exactly the words the NFA accepts', () => {
    fc.assert(
      fc.property(nfaArb, (nfa) => {
        fc.pre(subsetConstruction(nfa).dfa.states.length <= MAX_DFA);
        const { loaded, run } = convert(nfa);
        const { dfa } = runDfa(loaded, run!);
        for (const w of allWords(loaded.alphabet, 6))
          expect(runDfaOn(dfa, w), `"${w}"`).toBe(refAccepts(loaded, w));
      }),
      { numRuns: 150 },
    );
  });

  it('with all subsets, lists 2^|Q| states whose reachable part is the same DFA', () => {
    fc.assert(
      fc.property(
        nfaArb.filter((a) => a.states.length <= 4),
        (nfa) => {
          fc.pre(subsetConstruction(nfa).dfa.states.length <= MAX_DFA);
          const { loaded, run } = convert(nfa, { subsets: 'all' });
          const { dfa, sets } = runDfa(loaded, run!);
          expect(dfa.states.length).toBe(2 ** loaded.states.length);
          expect(Object.values(sets)).toEqual(allSubsets(loaded.states));
          // Walk the reachable part breadth first, symbols in order, and compare as sets.
          const want = subsetConstruction(loaded);
          const found = new Set(
            dfa.states.filter((q) => !run!.unreachable!.includes(q)).map((q) => sets[q]!.join(',')),
          );
          expect(found).toEqual(new Set(Object.values(want.sets).map((s) => s.join(','))));
          for (const w of allWords(loaded.alphabet, 5))
            expect(runDfaOn(dfa, w)).toBe(refAccepts(loaded, w));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('blows up to 2^n states for "the n-th symbol from the end is 1"', () => {
    for (const n of [1, 2, 3, 4]) {
      const { run } = convert(nthFromEnd(n));
      expect(run!.rows.length).toBe(2 ** n);
    }
  });

  it('refuses an NFA whose DFA is too big to draw, and keeps the old one', () => {
    const t = new Timeline(nfaToDfa, { subsets: 'reachable' }, 1, [
      ['load', formatAutomaton(nthFromEnd(5))],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/32 states, too many to draw/);
    expect(t.endState()).toEqual(t.initial.state);
  });

  it('says why an all-subsets run is refused for a large NFA', () => {
    const { steps } = convert(nthFromEnd(4), { subsets: 'all' });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.say).toMatch(/2\^5 = 32 subsets: too many to draw/);
  });
});

describe('drawn text size', () => {
  // The 16-state DFA of the fourth symbol from the end, with its NFA and its 16-row table: 4.9 px
  // on a phone before the states could move closer together, 7.3 now. Packing the DFA tighter
  // still draws its labels over its arrows, so a phone stays under 9 px here.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(nfaToDfa, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(nfaToDfa, PHONE_STAGE).px).toBeGreaterThanOrEqual(7.2);
  });
});
