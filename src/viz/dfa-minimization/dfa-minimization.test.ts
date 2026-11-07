import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { makeAutomaton, minimize, type Automaton } from '../_automata/automaton';
import { formatAutomaton } from '../_automata/parse';
import { dfaMinimization } from '.';
import { pairKey, type MinRun, type MinSettings } from './model';
import { chain } from './presets';

// ---------------------------------------------------------------------------------------------
// Reference: run a DFA from any state (a missing move rejects), and tell states apart by
// trying every word up to a length, apart from the kit.

function acceptsFrom(d: Automaton, q: string | undefined, w: string): boolean {
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

/** Two states of one DFA are equivalent when every word up to |Q| symbols agrees on them. */
function equivalent(d: Automaton, p: string, q: string, words: string[]): boolean {
  return words.every((w) => acceptsFrom(d, p, w) === acceptsFrom(d, q, w));
}

const STATES = ['q0', 'q1', 'q2', 'q3', 'q4', 'q5'];

/** A random DFA over {a, b}: up to 6 states, some moves missing, some states unreachable. */
const dfaArb = fc
  .record({
    n: fc.integer({ min: 1, max: 6 }),
    to: fc.array(fc.integer({ min: -1, max: 5 }), { minLength: 12, maxLength: 12 }),
    accept: fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 4 }),
  })
  .map(({ n, to, accept }) =>
    makeAutomaton({
      states: STATES.slice(0, n),
      alphabet: [],
      start: 'q0',
      accept: accept.filter((i) => i < n).map((i) => STATES[i]!),
      moves: STATES.slice(0, n).flatMap((from, i) =>
        ['a', 'b']
          .map((on, k) => ({ on, t: to[i * 2 + k]! }))
          .filter(({ t }) => t >= 0 && t < n)
          .map(({ on, t }) => ({ from, on, to: STATES[t]! })),
      ),
    }),
  );

const methods: MinSettings[] = [{ method: 'moore' }, { method: 'table' }];

function run(dfa: Automaton, settings: MinSettings) {
  const t = new Timeline(dfaMinimization, settings, 1, [
    ['load', formatAutomaton(dfa)],
    ['minimize'],
  ]);
  const loaded = t.endState().dfa;
  const steps = t.entries.at(-1)!.steps;
  return { loaded, steps, r: steps.at(-1)!.extra!.run! };
}

const blocksOf = (r: MinRun) => {
  const out = new Map<number, string[]>();
  for (const q of r.work.states) out.set(r.block[q]!, [...(out.get(r.block[q]!) ?? []), q]);
  return [...out.values()];
};

describe('dfa-minimization', () => {
  it('ends with the minimal DFA minimize() finds, by both methods', () => {
    fc.assert(
      fc.property(dfaArb, (dfa) => {
        for (const settings of methods) {
          const { loaded, r } = run(dfa, settings);
          const want = minimize(loaded);
          expect(r.min, settings.method).toEqual(want.dfa);
          expect(r.blocks).toEqual(want.blocks);
          expect(r.min!.states.length).toBe(want.dfa.states.length);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('accepts the same words, and no two of its states can be told apart', () => {
    fc.assert(
      fc.property(dfaArb, fc.constantFrom(...methods), (dfa, settings) => {
        const { loaded, r } = run(dfa, settings);
        const min = r.min!;
        for (const w of allWords(loaded.alphabet, 7))
          expect(acceptsFrom(min, min.start, w), `"${w}"`).toBe(
            acceptsFrom(loaded, loaded.start, w),
          );
        const words = allWords(min.alphabet, min.states.length);
        for (const p of min.states)
          for (const q of min.states)
            if (p < q) expect(equivalent(min, p, q, words), `${p} ~ ${q}`).toBe(false);
      }),
      { numRuns: 150 },
    );
  });

  it('only ever splits blocks (Moore), and only splits states some word tells apart', () => {
    fc.assert(
      fc.property(dfaArb, (dfa) => {
        const { steps } = run(dfa, { method: 'moore' });
        let before: string[][] | undefined;
        for (const st of steps) {
          const r = st.extra!.run!;
          if (!r.refining) continue;
          const blocks = blocksOf(r);
          expect(st.vars!.blocks).toBe(blocks.length);
          const words = allWords(r.work.alphabet, r.work.states.length);
          // States in different blocks really differ: some word separates them.
          for (const x of blocks)
            for (const y of blocks)
              if (x !== y) expect(equivalent(r.work, x[0]!, y[0]!, words)).toBe(false);
          if (before) {
            // Every block lies inside one block of the round before.
            for (const b of blocks)
              expect(before.some((o) => b.every((q) => o.includes(q)))).toBe(true);
            expect(blocks.length).toBeGreaterThanOrEqual(before.length);
          }
          before = blocks;
        }
      }),
      { numRuns: 150 },
    );
  });

  it('marks only pairs its symbol really separates (table filling)', () => {
    fc.assert(
      fc.property(dfaArb, (dfa) => {
        const { steps } = run(dfa, { method: 'table' });
        for (const st of steps) {
          const r = st.extra!.run!;
          if (!r.refining) continue;
          const w = r.work;
          const words = allWords(w.alphabet, w.states.length);
          expect(st.vars!.marked).toBe(Object.keys(r.marked).length);
          for (const [k, c] of Object.entries(r.marked)) {
            const [p, q] = k.split('|') as [string, string];
            expect(pairKey(w.states, p, q)).toBe(k);
            if (c === 'ε') expect(w.accept.includes(p)).not.toBe(w.accept.includes(q));
            else
              expect(words.some((x) => acceptsFrom(w, p, c + x) !== acceptsFrom(w, q, c + x))).toBe(
                true,
              );
          }
        }
      }),
      { numRuns: 150 },
    );
  });

  it('takes one round per state on a chain, the most Moore can need', () => {
    for (const n of [2, 3, 5, 8]) {
      const { r } = run(chain(n), { method: 'moore' });
      expect(r.round).toBe(n - 1);
      expect(r.min!.states).toHaveLength(n);
    }
  });

  it('refuses an NFA and keeps the DFA it has', () => {
    const t = new Timeline(dfaMinimization, { method: 'moore' }, 1, [
      ['load', 'q0 a -> q1; q0 a -> q0; accept q1'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/That is an NFA: q0 has 2 moves on a/);
    expect(t.endState()).toEqual(t.initial.state);
  });
});
