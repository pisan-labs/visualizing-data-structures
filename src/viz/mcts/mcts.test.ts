import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deriveSeed, makeRng, type Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { mcts } from '.';
import {
  bestMove,
  cOf,
  inTree,
  meanOf,
  ROOT,
  TREE,
  type MctsSettings,
  type MctsState,
} from './model';

/** UCT written independently of the page: nested objects and a recursive descent. */
interface RefNode {
  token: string;
  kids: RefNode[];
  reward?: number;
  open: number;
  n: number;
  w: number;
}

function refTree(): RefNode {
  const make = (id: number): RefNode => ({
    token: TREE[id]!.token,
    kids: TREE[id]!.children.map(make),
    reward: TREE[id]!.reward,
    open: 0,
    n: 0,
    w: 0,
  });
  return make(ROOT);
}

function refIterate(root: RefNode, c: number, rng: Rng) {
  const descend = (v: RefNode): number => {
    let r: number;
    if (!v.kids.length) r = v.reward!;
    else if (v.open < v.kids.length) {
      // Expand the next child, then finish at random below it.
      const child = v.kids[v.open++]!;
      let leaf = child;
      while (leaf.kids.length) leaf = leaf.kids[Math.floor(rng.next() * leaf.kids.length)]!;
      r = leaf.reward!;
      child.n += 1;
      child.w += r;
    } else {
      const score = (k: RefNode) => k.w / k.n + c * Math.sqrt(Math.log(v.n) / k.n);
      const best = v.kids.reduce((a, k) => (score(k) > score(a) ? k : a));
      r = descend(best);
    }
    v.n += 1;
    v.w += r;
    return r;
  };
  descend(root);
}

/** The reference's counts in TREE's order (breadth first). */
function refCounts(root: RefNode) {
  const out: { n: number; w: number }[] = [];
  const queue = [root];
  while (queue.length) {
    const v = queue.shift()!;
    out.push({ n: v.n, w: v.w });
    queue.push(...v.kids);
  }
  return out;
}

const settingsArb = fc.record({
  c: fc.constantFrom('0' as const, '0.5' as const, 'sqrt2' as const, '2' as const),
  budget: fc.constantFrom('10' as const, '30' as const, '100' as const),
});

/** The invariants of a search tree. */
function checkState(s: MctsState) {
  expect(s.n[ROOT]).toBe(s.iterations);
  for (const t of TREE) {
    const kids = t.children;
    if (!inTree(s, t.id)) expect(s.n[t.id]).toBe(0);
    expect(s.tried[t.id]).toBeLessThanOrEqual(kids.length);
    if (!kids.length || !inTree(s, t.id) || s.n[t.id] === 0) continue;
    // Each visit of a node either ended there (when it was added) or went on to a child.
    const below = kids.reduce((a, k) => a + s.n[k]!, 0);
    expect(s.n[t.id]).toBe(below + (t.id === ROOT ? 0 : 1));
    expect(meanOf(s, t.id)).toBeGreaterThanOrEqual(0);
    expect(meanOf(s, t.id)).toBeLessThanOrEqual(1);
  }
}

describe('mcts', () => {
  it('matches an independent reference over a whole budget', () => {
    fc.assert(
      fc.property(settingsArb, fc.integer({ min: 1, max: 1000 }), (set, seed) => {
        const settings: MctsSettings = { ...set };
        const s = new Timeline(mcts, settings, seed, [['run']]).endState();
        const root = refTree();
        const rng = makeRng(deriveSeed(seed, 0));
        for (let k = 0; k < Number(settings.budget); k++) refIterate(root, cOf(settings), rng);
        refCounts(root).forEach(({ n, w }, id) => {
          expect(s.n[id]).toBe(n);
          expect(s.w[id]).toBeCloseTo(w, 9);
        });
        const move = root.kids.reduce((a, k) => (k.n > a.n ? k : a));
        expect(TREE[bestMove(s)!]!.token).toBe(move.token);
      }),
      { numRuns: 120 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    const callArb = fc.constantFrom<OpCall>(['iterate'], ['run'], ['reset']);
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(callArb, { maxLength: 12 }),
        fc.integer({ min: 1, max: 1000 }),
        (set, calls, seed) => {
          const t = new Timeline(mcts, { ...set }, seed, calls);
          for (const e of t.entries) {
            checkState(e.end);
            for (const step of e.steps) {
              checkState(step.state);
              const tr = step.extra?.trace;
              if (!tr) continue;
              // The rollout goes down one level per random number and ends at a sentence.
              expect(tr.us).toHaveLength(tr.rollout.length);
              expect(TREE[tr.leaf]!.children).toHaveLength(0);
              expect(tr.r).toBe(TREE[tr.leaf]!.reward);
              for (const u of tr.us) expect(u >= 0 && u < 1).toBe(true);
            }
            if (e.call[0] === 'run')
              expect(e.end.iterations).toBeGreaterThanOrEqual(Number(set.budget));
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('tells the story the examples and the concept page tell', () => {
    const run = (
      c: MctsSettings['c'],
      budget: MctsSettings['budget'],
      calls: OpCall[] = [['run']],
    ) => new Timeline(mcts, { c, budget }, 3, calls).endState();
    const kids = TREE[ROOT]!.children;
    const counts = (s: MctsState) => kids.map((k) => s.n[k]);
    const means = (s: MctsState) => kids.map((k) => meanOf(s, k).toFixed(2));
    const at30 = run('sqrt2', '30');
    expect(counts(at30)).toEqual([13, 11, 6]);
    expect(means(at30)).toEqual(['0.60', '0.55', '0.25']);
    const at100 = run('sqrt2', '100');
    expect(counts(at100)).toEqual([26, 63, 11]);
    expect(means(at100)[1]).toBe('0.82');
    const dogRan = TREE.find((t) => t.token === 'ran' && TREE[t.parent!]!.token === 'dog')!;
    expect(at100.n[dogRan.id]).toBe(55);
    expect(counts(run('sqrt2', '10'))).toEqual([4, 3, 3]);
    const greedy = run('0', '30');
    expect(counts(greedy)).toEqual([28, 1, 1]);
    expect(meanOf(greedy, kids[1]!)).toBeCloseTo(0.2, 9);
    expect(counts(run('2', '100'))).toEqual([36, 48, 16]);
    // The first rounds: iteration 5 picks dog over cat, the bonus beating the mean.
    const five = run(
      'sqrt2',
      '30',
      Array.from({ length: 5 }, (): OpCall => ['iterate']),
    );
    const fifth = five.history[4]!.scores[0]!.ucb.map(([, u]) => u.toFixed(2));
    expect(fifth).toEqual(['1.73', '1.77', '1.77']);
    expect(five.history[4]!.selected[1]).toBe(kids[1]);
    expect(five.history[3]!.scores[0]!.ucb.map(([, u]) => u.toFixed(2))).toEqual([
      '1.98',
      '1.58',
      '1.58',
    ]);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(mcts, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(mcts, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
