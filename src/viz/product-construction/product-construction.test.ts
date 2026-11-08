import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Step } from '../../engine/types';
import type { Shape } from '../../render/scene';
import type { Automaton } from '../_automata/automaton';
import { formatAutomaton } from '../_automata/parse';
import { randomDfa } from '../_automata/random';
import { productConstruction as def } from '.';
import { MAX_PAIRS, loadPair, machine, rename } from './machines';
import {
  parseMachines,
  type BuildRun,
  type ProdExtra,
  type ProdSettings,
  type ProdState,
} from './model';
import { OPS, SET_OPS, type SetOp } from './product';
import { TYPICAL_STAGES } from '../../render/stage';

// ---------------------------------------------------------------------------------------------
// Reference: runs and the set operations written from the definitions, apart from the model.

/** Where a DFA is after reading w, or null once a move is missing (it rejects from there). */
function refRun(a: Automaton, w: string): string | null {
  let q: string | null = a.start;
  for (const c of w) {
    if (q === null) return null;
    q = a.moves.find((m) => m.from === q && m.on === c)?.to ?? null;
  }
  return q;
}

const refAccepts = (a: Automaton, w: string): boolean => {
  const q = refRun(a, w);
  return q !== null && a.accept.includes(q);
};

const REF_OPS: Record<SetOp, (x: boolean, y: boolean) => boolean> = {
  union: (x, y) => x || y,
  intersection: (x, y) => x && y,
  difference: (x, y) => x && !y,
  symmetric: (x, y) => (x ? !y : y),
};

function allWords(symbols: string[], n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => symbols.map((c) => w + c));
    out.push(...level);
  }
  return out;
}

const settings = (op: SetOp): ProdSettings => ({ op });

/** Two random DFAs from random.ts: A on p0, p1, ..., B on q0, q1, ..., sometimes over different alphabets. */
const pairArb = fc
  .record({
    seed: fc.integer({ min: 1, max: 2 ** 31 - 1 }),
    na: fc.integer({ min: 1, max: 3 }),
    nb: fc.integer({ min: 1, max: 3 }),
    partialA: fc.boolean(),
    partialB: fc.boolean(),
    alphabets: fc.constantFrom(
      [
        ['a', 'b'],
        ['a', 'b'],
      ],
      [['a'], ['a', 'b']],
      [
        ['0', '1'],
        ['0', '1'],
      ],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    ),
  })
  .map(({ seed, na, nb, partialA, partialB, alphabets }) => {
    const rng = makeRng(seed);
    const a = rename(randomDfa(rng, na, { alphabet: [...alphabets[0]!], partial: partialA }), 'p');
    const b = randomDfa(rng, nb, { alphabet: [...alphabets[1]!], partial: partialB });
    return [a, b] as [Automaton, Automaton];
  });

type T = Timeline<ProdState, ProdSettings, ProdExtra>;

/** Load the pair (it may be refused when the product is too big), then run the calls. */
function play(a: Automaton, b: Automaton, op: SetOp, more: OpCall[]): T | null {
  const t = new Timeline(def, settings(op), 1, [loadPair(a, b), ...more]) as T;
  return t.entries[0]!.end === t.initial.state ? null : t;
}

/** The product a finished build made, as an automaton. */
function builtDfa(r: BuildRun, alphabet: string[]): Automaton {
  return {
    states: r.rows,
    alphabet,
    start: r.rows[0]!,
    accept: r.accept,
    moves: r.moves,
  };
}

/** Invariants of a build at every step: breadth first, moves and accept states from A and B. */
function checkBuild(st: Step<ProdState, ProdExtra>, op: SetOp) {
  const r = st.extra!.build!;
  const { a, b } = st.state;
  const alphabet = a.alphabet;
  expect(new Set(r.rows).size, 'each pair is one state').toBe(r.rows.length);
  // Where a machine goes on c, with a missing move going to its dead state.
  const step = (m: Automaton, q: string, c: string) =>
    m.moves.find((x) => x.from === q && x.on === c)?.to ?? deadName(m);
  for (const n of r.rows) {
    const [p, q] = n.split(',') as [string, string];
    const x = a.accept.includes(p);
    const y = b.accept.includes(q);
    expect(r.accept.includes(n), `${n} accepts for ${op}`).toBe(REF_OPS[op](x, y));
  }
  for (const m of r.moves) {
    const [p, q] = m.from.split(',') as [string, string];
    expect(m.to, `δ(${m.from}, ${m.on})`).toBe(`${step(a, p, m.on)},${step(b, q, m.on)}`);
    expect([...r.done, r.T]).toContain(m.from);
    expect(alphabet).toContain(m.on);
  }
  const working = r.T && !r.done.includes(r.T) ? [r.T] : [];
  expect([...r.done, ...working, ...r.queue], 'breadth first').toEqual(r.rows);
  expect(r.rows[0] ?? `${a.start},${b.start}`).toBe(`${a.start},${b.start}`);
  expect(st.vars!.pairs).toBe(r.rows.length);
  expect(st.vars!.queue).toBe(r.queue.length);
  // A pair that is done has a move on every symbol.
  for (const n of r.done)
    expect(r.moves.filter((m) => m.from === n).map((m) => m.on)).toEqual(alphabet);
}

/** The name complete() gives a dead state: "dead", or "dead2" and on if taken. */
function deadName(m: Automaton): string {
  let name = 'dead';
  for (let i = 2; m.states.includes(name); i++) name = `dead${i}`;
  return name;
}

describe('product-construction', () => {
  it('builds a product that accepts w exactly when op(A accepts w, B accepts w)', () => {
    fc.assert(
      fc.property(pairArb, fc.constantFrom(...SET_OPS), ([a, b], op) => {
        const t = play(a, b, op, [['build']]);
        fc.pre(t !== null);
        const steps = t!.entries[1]!.steps;
        for (const st of steps) checkBuild(st, op);
        const r = steps.at(-1)!.extra!.build!;
        expect(r.finished).toBe(true);
        expect(r.queue).toEqual([]);
        expect(t!.endState().built).toBe(true);
        const sigma = t!.endState().a.alphabet;
        const product = builtDfa(r, sigma);
        expect(product.moves.length, 'complete').toBe(r.rows.length * sigma.length);
        for (const w of allWords(sigma, 6))
          expect(refAccepts(product, w), `${op} on "${w}"`).toBe(
            REF_OPS[op](refAccepts(a, w), refAccepts(b, w)),
          );
      }),
      { numRuns: 150 },
    );
  });

  it('builds the same pairs and moves for every operation; only the accept states differ', () => {
    fc.assert(
      fc.property(pairArb, ([a, b]) => {
        const runs = SET_OPS.map((op) => play(a, b, op, [['build']]));
        fc.pre(runs.every((t) => t !== null));
        const builds = runs.map((t) => t!.entries[1]!.steps.at(-1)!.extra!.build!);
        for (const r of builds) {
          expect(r.rows).toEqual(builds[0]!.rows);
          expect(r.moves).toEqual(builds[0]!.moves);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('tracks both runs with the pair, symbol by symbol, and gives op of the two verdicts', () => {
    fc.assert(
      fc.property(
        pairArb,
        fc.constantFrom(...SET_OPS),
        fc.array(fc.constantFrom('a', 'b', '0', '1', 'c'), { maxLength: 7 }),
        ([a, b], op, letters) => {
          const t = play(a, b, op, []);
          fc.pre(t !== null);
          const sigma = t!.endState().a.alphabet;
          const w = letters.filter((c) => sigma.includes(c)).join('');
          const run = new Timeline(def, settings(op), 1, [loadPair(a, b), ['run', w || 'eps']])
            .entries[1]!.steps;
          for (const st of run) {
            const r = st.extra!.run!;
            const read = w.slice(0, r.read);
            // A missing move sends the completed machine to its dead state, and it stays there.
            expect(r.p).toBe(refRun(a, read) ?? deadName(a));
            expect(r.q).toBe(refRun(b, read) ?? deadName(b));
            expect(st.vars!.pair).toBe(`(${r.p}, ${r.q})`);
          }
          const end = run.at(-1)!.extra!.run!;
          expect(end.read).toBe(w.length);
          expect(end.verdictA).toBe(refAccepts(a, w) ? 'accept' : 'reject');
          expect(end.verdictB).toBe(refAccepts(b, w) ? 'accept' : 'reject');
          expect(end.verdict).toBe(
            REF_OPS[op](refAccepts(a, w), refAccepts(b, w)) ? 'accept' : 'reject',
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  it('complements: every answer flips, twice gives the language back', () => {
    fc.assert(
      fc.property(pairArb, fc.constantFrom('complementA', 'complementB'), ([a, b], which) => {
        const t = play(a, b, 'union', [[which], [which]]);
        fc.pre(t !== null);
        const loaded = t!.entries[0]!.end;
        const once = t!.entries[1]!.end;
        const twice = t!.entries[2]!.end;
        const key = which === 'complementA' ? 'a' : 'b';
        const before = loaded[key];
        const after = once[key];
        expect(after.moves.length, 'complete').toBe(after.states.length * after.alphabet.length);
        expect(once[key === 'a' ? 'b' : 'a']).toEqual(loaded[key === 'a' ? 'b' : 'a']);
        expect(once.built).toBe(false);
        for (const w of allWords(before.alphabet, 6)) {
          expect(refAccepts(after, w), `"${w}"`).toBe(!refAccepts(before, w));
          expect(refAccepts(twice[key], w)).toBe(refAccepts(before, w));
        }
        // Each step of a complement shows a machine the next step builds on.
        for (const st of t!.entries[1]!.steps)
          expect(st.state[key].alphabet).toEqual(before.alphabet);
      }),
      { numRuns: 150 },
    );
  });

  it('turns a difference into an intersection with a complement', () => {
    fc.assert(
      fc.property(pairArb, ([a, b]) => {
        const diff = play(a, b, 'difference', [['build']]);
        const inter = play(a, b, 'intersection', [['complementB'], ['build']]);
        fc.pre(diff !== null && inter !== null);
        const r1 = diff!.entries[1]!.steps.at(-1)!.extra!.build!;
        const r2 = inter!.entries[2]!.steps.at(-1)!.extra!.build!;
        const sigma = diff!.endState().a.alphabet;
        for (const w of allWords(sigma, 5))
          expect(refAccepts(builtDfa(r2, sigma), w)).toBe(refAccepts(builtDfa(r1, sigma), w));
      }),
      { numRuns: 60 },
    );
  });

  it('places each pair where its A state’s column meets its B state’s row, on every stage', () => {
    const stages = [undefined, ...TYPICAL_STAGES];
    for (const ex of def.examples) {
      const t = new Timeline(def, { ...def.defaults, ...ex.settings }, 1, ex.ops) as T;
      for (let i = 0; i < t.length; i++) {
        const { step } = t.at(i);
        for (const stage of stages) {
          const scene = def.view(step, t.settings, stage);
          const at = new Map(
            scene.shapes
              .filter((s): s is Extract<Shape, { kind: 'circle' }> => s.kind === 'circle')
              .map((s) => [s.id, s]),
          );
          const product = scene.shapes.filter(
            (s) => s.kind === 'circle' && /^p-s-[^-]+$/.test(s.id),
          );
          for (const s of product) {
            const [p, q] = s.id.slice(4).split(',') as [string, string];
            const sa = at.get(`a-s-${p}`);
            const sb = at.get(`b-s-${q}`);
            if (sa) expect(at.get(s.id)!.x, `${ex.id} ${s.id}`).toBeCloseTo(sa.x);
            if (sb) expect(at.get(s.id)!.y, `${ex.id} ${s.id}`).toBeCloseTo(sb.y);
          }
          // A sits above the grid and B left of it, clear of every product state.
          const ys = (pre: string) =>
            scene.shapes
              .filter((s) => s.kind === 'circle' && s.id.startsWith(pre))
              .map((s) => (s as { y: number }).y);
          const xs = (pre: string) =>
            scene.shapes
              .filter((s) => s.kind === 'circle' && s.id.startsWith(pre))
              .map((s) => (s as { x: number }).x);
          if (product.length) {
            expect(Math.max(...ys('a-s-')) + 44).toBeLessThan(Math.min(...ys('p-s-')));
            expect(Math.max(...xs('b-s-')) + 44).toBeLessThan(Math.min(...xs('p-s-')));
          }
        }
      }
    }
  });

  it('draws every step of random sessions on every stage, marks on real shapes', () => {
    const stages = [undefined, ...TYPICAL_STAGES];
    const callArb = fc.oneof(
      fc.constant<OpCall>(['build']),
      fc.constant<OpCall>(['complementA']),
      fc.constant<OpCall>(['complementB']),
      fc.constantFrom<OpCall>(['run', 'ab'], ['run', 'eps'], ['run', 'baab'], ['run', '0110']),
    );
    fc.assert(
      fc.property(
        pairArb,
        fc.constantFrom(...SET_OPS),
        fc.array(callArb, { maxLength: 5 }),
        ([a, b], op, calls) => {
          const t = play(a, b, op, calls);
          fc.pre(t !== null);
          for (let i = 0; i < t!.length; i++) {
            const { step } = t!.at(i);
            for (const stage of stages) {
              const scene = def.view(step, t!.settings, stage);
              const ids = scene.shapes.map((s) => s.id);
              expect(new Set(ids).size, `step ${i}: unique ids`).toBe(ids.length);
              for (const m of step.marks) expect(ids, `mark ${m.id}`).toContain(m.id);
              expect(scene.label.length).toBeGreaterThan(0);
              for (const s of scene.shapes)
                if (s.kind !== 'arrow' && s.kind !== 'polygon') {
                  expect(Number.isFinite(s.x) && Number.isFinite(s.y), s.id).toBe(true);
                }
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('reads two machines separated by |, and says what is wrong otherwise', () => {
    const ok = parseMachines('q0 a -> q1; accept q1 | r0 b -> r1; accept r1');
    expect(ok).not.toBeInstanceOf(Error);
    const { a, b, differ, typed } = ok as Exclude<typeof ok, Error>;
    expect(a.alphabet).toEqual(['a', 'b']);
    expect(b.alphabet).toEqual(['a', 'b']);
    expect(differ).toBe(true);
    expect(typed.map((m) => m.alphabet)).toEqual([['a'], ['b']]);
    const msg = (text: string) => (parseMachines(text) as Error).message;
    expect(msg('q0 a -> q1')).toMatch(/two machines, A and B, with a \| between them/);
    expect(msg('q0 a -> q1 | q0 a -> q1 | q0 a -> q1')).toMatch(/exactly two machines.*3 here/);
    expect(msg('q0 a -> q1 | q0 ab -> q1')).toMatch(/^In machine B: "ab"/);
    expect(msg('q0 a -> q1; q0 a -> q2 | q0 a -> q1')).toMatch(/Machine A is not a DFA/);
    expect(msg(' | q0 a -> q1')).toMatch(/Machine A is empty/);
    expect(msg('p0 a -> p1; p1 a -> p2; p2 a -> p3; p3 b -> p0 | q0 a -> q1')).toMatch(
      /Machine A has 5 states once a dead state/,
    );
  });

  it('refuses a product that reaches too many pairs, and keeps the old machines', () => {
    const four = (x: string) =>
      `${x}0 a -> ${x}1; ${x}1 a -> ${x}2; ${x}2 a -> ${x}3; ${x}3 a -> ${x}0; ${x}0 b -> ${x}0; ${x}1 b -> ${x}1; ${x}2 b -> ${x}2; ${x}3 b -> ${x}3; accept ${x}0`;
    const shift = 'q0 a,b -> q1; q1 a,b -> q2; q2 a,b -> q3; q3 a,b -> q0; accept q0';
    const t = new Timeline(def, def.defaults, 1, [['load', `${four('p')} | ${shift}`]]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(
      new RegExp(`reaches \\d+ pairs, too many to draw.*at most ${MAX_PAIRS}`),
    );
    expect(t.endState()).toEqual(t.initial.state);
  });

  it('explains every pair it accepts with both halves, in the narration', () => {
    const t = new Timeline(def, settings('union'), 1, [
      loadPair(machine('startsA'), machine('endsB')),
      ['build'],
    ]);
    const says = t.entries[1]!.steps.map((s) => s.say).join(' ');
    expect(says).toMatch(/A has no move from p0 on b\. A pair moves only when both machines can/);
    expect(says).toMatch(/Only q1 accepts, so \(dead, q1\) accepts: for a union, one is enough\./);
    expect(says).toMatch(/5 of the 3 × 2 = 6 pairs/);
  });

  it('says an intersection is empty when no reachable pair accepts', () => {
    const t = new Timeline(def, settings('intersection'), 1, [
      loadPair(machine('evenA'), machine('oddA')),
      ['build'],
    ]);
    expect(t.entries[1]!.steps.at(-1)!.say).toMatch(/A ∩ B is empty: no word is in both A and B/);
    expect(OPS.intersection.label).toBe('A ∩ B');
  });

  it('formats a loaded pair back to the text it came from', () => {
    const a = machine('hasAa');
    const b = machine('endsA');
    expect(loadPair(a, b)).toEqual(['load', `${formatAutomaton(a)} | ${formatAutomaton(b)}`]);
  });
});
