import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { closure, EPS, sortStates } from '../_automata/automaton';
import { matches, readRegex, regexSize, showRegex } from '../_automata/regex';
import { construct } from '../_automata/thompson-construct';
import { randomRegex } from '../_automata/regex-random';
import { backtrack, CAP, machine, simulate, type Machine, type Order } from './engines';
import def from './index';
import {
  defaults,
  growthShape,
  MAX_M,
  readCall,
  STACK_SHOWN,
  type EngSettings,
  type EngState,
} from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

const machineFor = (text: string, order: Order = 'greedy'): Machine => {
  const p = readRegex(text);
  if (p instanceof Error) throw p;
  const { nfa, frags } = construct(p, 'thompson');
  return machine(nfa, frags, order);
};

/** A plain recursive backtracker: the same order and the same empty-loop rule, no stack. */
function reference(m: Machine, w: string, cap = CAP) {
  let steps = 0;
  const a = m.nfa;
  const go = (q: string, i: number, seen: ReadonlySet<string>): 'accept' | 'reject' | 'stopped' => {
    steps++;
    if (a.accept.includes(q) && i === w.length) return 'accept';
    if (steps >= cap) return 'stopped';
    const here = new Set(seen).add(q);
    for (const mv of m.out[q]!) {
      let r: 'accept' | 'reject' | 'stopped';
      if (mv.on === EPS) {
        if (here.has(mv.to)) continue;
        r = go(mv.to, i, here);
      } else if (w[i] === mv.on) r = go(mv.to, i + 1, new Set());
      else continue;
      if (r !== 'reject') return r;
    }
    return 'reject';
  };
  const result = go(a.start, 0, new Set());
  return { result, steps };
}

/** The sets of the simulation, straight from the definition. */
function referenceSets(m: Machine, w: string): string[][] {
  const a = m.nfa;
  let set = closure(a, [a.start]);
  const out = [set];
  for (const c of w) {
    if (!set.length) break;
    set = closure(
      a,
      a.moves.filter((mv) => mv.on === c && set.includes(mv.from)).map((mv) => mv.to),
    );
    out.push(set);
  }
  return out;
}

/** A random expression of 1 to 4 symbols over a, b (with + and ?), within the page's limit. */
const exprArb = fc.integer({ min: 1, max: 1e9 }).chain((seed) =>
  fc.integer({ min: 1, max: 4 }).map((n) => {
    const rng = makeRng(seed);
    for (;;) {
      const r = randomRegex(rng, n, ['a', 'b'], true);
      if (regexSize(r) <= MAX_M) return showRegex(r);
    }
  }),
);
const wordArb = fc.stringMatching(/^[ab]{0,8}$/);

describe('regex engines', () => {
  it('both engines agree with the direct matcher, and the backtracker with a plain recursive one', () => {
    fc.assert(
      fc.property(exprArb, wordArb, fc.constantFrom<Order>('greedy', 'lazy'), (text, w, order) => {
        const m = machineFor(text, order);
        const r = readRegex(text);
        if (r instanceof Error) throw r;
        const want = matches(r.tree.r, w) ? 'accept' : 'reject';
        const b = backtrack(m, w);
        expect(b).toMatchObject(reference(m, w));
        if (b.result !== 'stopped') expect(b.result, `${text} on "${w}"`).toBe(want);
        const s = simulate(m, w);
        expect(s.result, `${text} on "${w}"`).toBe(want);
        const sets = referenceSets(m, w);
        expect(s.rows.map((x) => x.set)).toEqual(sets);
        expect(s.steps).toBe(sets.reduce((t, x) => t + x.length, 0));
        // The live set never holds more states than the NFA has, so the work is O(m·n).
        expect(s.widest).toBeLessThanOrEqual(m.nfa.states.length);
        expect(s.steps).toBeLessThanOrEqual(m.nfa.states.length * (w.length + 1));
      }),
      { numRuns: 400 },
    );
  });

  it('doubles its steps on (a|a)*b with each extra a, until the cap; the simulation adds 8', () => {
    const m = machineFor('(a|a)*b');
    let prev = backtrack(m, 'a');
    let prevNfa = simulate(m, 'a').steps;
    for (let n = 2; n <= 16; n++) {
      const b = backtrack(m, 'a'.repeat(n));
      const s = simulate(m, 'a'.repeat(n)).steps;
      expect(s - prevNfa).toBe(8);
      prevNfa = s;
      if (b.result === 'stopped') {
        expect(n).toBe(13);
        expect(b.steps).toBe(CAP);
        return;
      }
      expect(b.result).toBe('reject');
      expect(b.steps).toBeGreaterThanOrEqual(2 * prev.steps);
      prev = b;
    }
    throw new Error('never reached the cap');
  });

  it('is fast when the first path matches, whichever order it tries', () => {
    for (const order of ['greedy', 'lazy'] as const) {
      const m = machineFor('(a|a)*b', order);
      const b = backtrack(m, 'aaaaaaaaaaaab');
      expect(b.result).toBe('accept');
      expect(b.steps).toBeLessThan(simulate(m, 'aaaaaaaaaaaab').steps);
    }
    // Lazy finds a?a?a?aaa's match at once; greedy backtracks into it.
    expect(backtrack(machineFor('a?a?a?aaa', 'lazy'), 'aaa').steps).toBe(12);
    expect(backtrack(machineFor('a?a?a?aaa', 'greedy'), 'aaa').steps).toBe(66);
  });

  it('cuts off empty loops instead of spinning', () => {
    for (const text of ['(a*)*b', '(a?)*', '(ε|a)*b', '((a*)*)*']) {
      const m = machineFor(text);
      const b = backtrack(m, 'aaaa');
      expect(b.result).not.toBe('stopped');
    }
  });

  it('tells growth shapes apart', () => {
    expect(growthShape([1, 2])).toBeNull();
    expect(growthShape([5, 5, 5])).toBeNull();
    expect(growthShape([4, 8, 12])).toBe('linear');
    expect(growthShape([100, 121, 144])).toBe('polynomial');
    expect(growthShape([4, 8, 16])).toBe('exponential');
  });
});

describe('regex engines page', () => {
  const settingsArb = fc.record({
    engine: fc.constantFrom('both', 'backtrack', 'nfa'),
    order: fc.constantFrom('greedy', 'lazy'),
  }) as fc.Arbitrary<EngSettings>;
  const callArb: fc.Arbitrary<OpCall> = fc.oneof(
    fc.tuple(exprArb, wordArb).map(([r, w]) => ['match', `${r} ; ${w || 'eps'}`] as OpCall),
    wordArb.map((w) => ['match', w || 'eps'] as OpCall),
    fc
      .tuple(exprArb, fc.constantFrom('a', 'ab', 'b'))
      .map(([r, u]) => ['grow', `${r} ; ${u}`] as OpCall),
    exprArb.map((r) => ['load', r] as OpCall),
  );

  /** What holds at every step. */
  function check(s: EngState) {
    const states = new Set(s.nfa.states);
    expect(s.nfa.states.length).toBe(2 * s.m);
    expect(s.word.length).toBeLessThanOrEqual(16);
    if (s.bt) {
      expect(states.has(s.bt.q)).toBe(true);
      expect(s.bt.at).toBeGreaterThanOrEqual(0);
      expect(s.bt.at).toBeLessThanOrEqual(s.word.length);
      expect(s.bt.stack.length).toBeLessThanOrEqual(Math.min(STACK_SHOWN, s.bt.depth));
      expect(s.bt.steps).toBeLessThanOrEqual(CAP);
      expect(s.bt.backtracks).toBeLessThan(Math.max(1, s.bt.steps));
      for (const c of s.bt.stack) {
        expect(states.has(c.q) && states.has(c.from)).toBe(true);
        expect(c.at).toBeLessThanOrEqual(s.word.length);
      }
    }
    if (s.sim) {
      expect(s.sim.set).toEqual(sortStates(s.sim.set));
      for (const q of s.sim.set) expect(states.has(q)).toBe(true);
      expect(s.sim.set.length).toBeLessThanOrEqual(s.nfa.states.length);
      expect(s.sim.widest).toBeLessThanOrEqual(s.nfa.states.length);
      expect(s.sim.steps).toBeLessThanOrEqual(s.nfa.states.length * (s.sim.read + 1));
    }
    if (s.growth) {
      const g = s.growth;
      expect(g.limit * g.unit.length).toBeLessThanOrEqual(16);
      g.rows.forEach((r, i) => {
        expect(r.n).toBe(i + 1);
        expect(r.bt).toBeLessThanOrEqual(CAP);
        expect(r.nfa).toBeLessThanOrEqual(s.nfa.states.length * (r.n * g.unit.length + 1));
        if (r.btResult !== 'stopped') expect(r.btResult).toBe(r.nfaResult);
      });
      // Only the last row can be the one where the backtracker gave up.
      expect(g.rows.slice(0, -1).every((r) => r.btResult !== 'stopped')).toBe(true);
    }
  }

  it('keeps its invariants on every step, and its step counts only go up', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 5 }), (settings, calls) => {
        const t = new Timeline(def, settings, 1, calls);
        for (let i = 0; i < t.length; i++) check(t.at(i).step.state);
        for (const e of t.entries) {
          let bt = 0;
          let nfa = 0;
          for (const st of e.steps) {
            const s = st.state;
            if (s.mode !== 'match') continue;
            if (s.bt && s.phase === 'bt') {
              expect(s.bt.steps).toBeGreaterThanOrEqual(bt);
              bt = s.bt.steps;
            }
            if (s.sim) {
              expect(s.sim.steps).toBeGreaterThanOrEqual(nfa);
              nfa = s.sim.steps;
            }
          }
          const end = e.end;
          if (end.mode === 'match') {
            // A match ends with both counts, whichever engine was shown.
            expect(end.bt?.result && end.sim?.result).toBeTruthy();
            const m = machine(end.nfa, end.frags, settings.order);
            expect(end.bt!.steps).toBe(backtrack(m, end.word).steps);
            expect(end.sim!.steps).toBe(simulate(m, end.word).steps);
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it('shows every visit of a short run, one dead end per step at the usual pace', () => {
    const t = new Timeline(def, defaults, 1, [['match', '(a|a)*b ; aaa']]);
    const steps = t.entries[0]!.steps;
    const visits = steps.filter((s) => s.state.phase === 'bt' && s.state.bt!.steps > 0);
    expect(visits.map((s) => s.state.bt!.steps)).toEqual(
      Array.from({ length: 104 }, (_, i) => i + 1),
    );
    expect(visits.filter((s) => s.level === 2).length).toBe(31);
    expect(steps.at(-1)!.say).toContain('Both reject aaa: the backtracker in 104 steps');
  });

  it('skips ahead on a long run, stopping as the count doubles, and stops at the cap', () => {
    const t = new Timeline(def, defaults, 1, [['match', '(a|a)*b ; aaaaaaaaaaaaaa']]);
    const steps = t.entries[0]!.steps;
    const counts = steps.filter((s) => s.state.phase === 'bt').map((s) => s.state.bt!.steps);
    const late = counts.filter((k) => k > 150);
    expect(late).toEqual([256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, CAP]);
    expect(t.endState().bt!.result).toBe('stopped');
    expect(t.endState().sim!.result).toBe('reject');
  });

  it('says a flat count plainly, in the singular', () => {
    const t = new Timeline(def, def.defaults, 1, [['grow', 'b ; a']]);
    const say = t.entries[0]!.steps.at(-1)!.say;
    // Was "steps went from 1 to 1, then stayed there" and "stayed at 1 steps".
    expect(say).toContain('the backtracker took 1 step every time');
    expect(say).toContain('The NFA simulation stayed at 1 step:');
    expect(say).not.toMatch(/from 1 to 1|\b1 steps/);
  });

  it('reads its input as an expression and a word', () => {
    expect(readCall('(a|a)*b ; aaa', 'match')).toEqual({ regex: '(a|a)*b', word: 'aaa' });
    expect(readCall('aaa', 'match')).toEqual({ regex: null, word: 'aaa' });
    expect(readCall('ab', 'load')).toEqual({ regex: 'ab', word: null });
    expect(readCall('a* ; eps', 'match')).toEqual({ regex: 'a*', word: '' });
    expect(String(readCall('(a|a)*b', 'match'))).toContain('expression with no word');
    expect(String(readCall('a ; b ; c', 'match'))).toContain('one semicolon');
    expect(String(readCall('a ; aaaaaaaaaaaaaaaaa', 'match'))).toContain('16 symbols');
    expect(String(readCall('(a|b)*(a|b)(a|b)(a|b)c ; a', 'grow'))).toContain('keep it to 12');
  });

  it('asks growth questions whose answers match the expressions picked for them', () => {
    const shapes: Record<string, string> = {};
    for (const r of ['(a|a)*b', '(a|aa)*b', 'a*b', '(a|a)*', 'a*a*b', 'a*a*a*b', '(a|b)*a*c']) {
      const g = new Timeline(def, defaults, 1, [['grow', `${r} ; a`]]).endState().growth!;
      shapes[r] = String(
        growthShape(g.rows.filter((x) => x.btResult !== 'stopped').map((x) => x.bt)),
      );
    }
    expect(shapes).toEqual({
      '(a|a)*b': 'exponential',
      '(a|aa)*b': 'exponential',
      'a*b': 'linear',
      '(a|a)*': 'linear',
      'a*a*b': 'polynomial',
      'a*a*a*b': 'polynomial',
      '(a|b)*a*c': 'polynomial',
    });
  });
});

describe('drawn text size', () => {
  // The chart's axis labels were 11 units (8.4 px on a laptop, 5.6 on a phone); now 15, as are
  // the counters and the stack's captions. A long expression's NFA may be drawn tighter.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
