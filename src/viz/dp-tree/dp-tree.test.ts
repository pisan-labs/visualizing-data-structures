import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import type { Token } from '../binary-tree/model';
import { dpTree as def } from '.';
import {
  listOf,
  naiveCount,
  pairs,
  readTree,
  treeOf,
  type TNode,
  type TreeSettings,
} from './model';

/** The reference: every subset of the nodes, checked against the rule. */
function reference(nodes: TNode[]) {
  const n = nodes.length;
  let best = -1;
  let bestSets: number[][] = [];
  let allowed = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    const ok = nodes.every(
      (v) => !((mask >> v.uid) & 1) || v.parent === null || !((mask >> v.parent) & 1),
    );
    if (!ok) continue;
    allowed++;
    const set = nodes.filter((v) => (mask >> v.uid) & 1).map((v) => v.uid);
    const total = set.reduce((t, u) => t + nodes[u]!.value, 0);
    if (total > best) {
      best = total;
      bestSets = [set];
    } else if (total === best) bestSets.push(set);
  }
  return { best, bestSets, allowed };
}

/** A random tree as a level-order list. */
const trees = fc
  .array(fc.oneof(fc.integer({ min: 0, max: 30 }), fc.constant(null)), {
    minLength: 1,
    maxLength: 14,
  })
  .map((xs) => {
    const tokens: Token[] = xs[0] === null ? [1, ...xs.slice(1)] : xs;
    // Trim to a valid level-order list of at most 10 nodes.
    const out: Token[] = [];
    let spots = 1;
    let count = 0;
    for (const t of tokens) {
      if (spots === 0 || (t !== null && count === 10)) break;
      out.push(t);
      spots--;
      if (t !== null) {
        spots += 2;
        count++;
      }
    }
    return out.map((t) => (t === null ? '_' : String(t))).join(' ');
  });

const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

function runSolve(list: string, settings: TreeSettings) {
  const t = new Timeline(def, settings, 1, [['build', list], ['solve']]);
  return t.entries[1]!;
}

describe('dp-tree', () => {
  it('finds the reference best both ways, with the same nodes, and counts the calls', () => {
    fc.assert(
      fc.property(trees, approaches, (list, approach) => {
        const tokens = readTree(list);
        expect(typeof tokens).not.toBe('string');
        const nodes = treeOf(tokens as Token[]);
        const ref = reference(nodes);
        const entry = runSolve(list, { approach });
        const end = entry.end;
        expect(end.best).toBe(ref.best);
        // The chosen nodes follow the rule, add up to the best, and are the same both ways.
        const chosen = end.chosen!;
        expect(ref.bestSets.map((s) => s.join(','))).toContain(chosen.join(','));
        const other = runSolve(list, { approach: approach === 'naive' ? 'pattern' : 'naive' }).end;
        expect(other.chosen).toEqual(chosen);
        const last = entry.steps.at(-1)!;
        const counts = naiveCount(nodes);
        expect(counts.subsets).toBe(ref.allowed);
        expect(last.vars?.['naive total']).toBe(counts.calls);
        expect(last.vars?.['pattern total']).toBe(nodes.length);
        expect(last.vars?.calls).toBe(approach === 'naive' ? counts.calls : nodes.length);
        if (approach === 'naive') expect(last.vars?.subsets).toBe(ref.allowed);
        // Every step: memo cells hold the true values of the nodes computed so far, children
        // before parents; the naive choice never breaks the rule.
        const truth = pairs(nodes);
        let calls = 0;
        for (const step of entry.steps) {
          const c = Number(step.vars?.calls ?? 0);
          expect(c).toBeGreaterThanOrEqual(calls);
          calls = c;
          step.state.memo.forEach((p, u) => {
            if (!p) return;
            expect(p).toEqual(truth[u]);
            for (const k of [nodes[u]!.left, nodes[u]!.right])
              if (k !== null) expect(step.state.memo[k]).not.toBeNull();
          });
          const now = step.extra?.now;
          if (now)
            nodes.forEach((v) => {
              if (now[v.uid] === true && v.parent !== null) expect(now[v.parent]).not.toBe(true);
            });
        }
      }),
      { numRuns: 200 },
    );
  });

  it('keeps level order through a build', () => {
    expect(listOf(treeOf(readTree('4 9 2 1 3 6 4') as Token[]))).toBe('4 9 2 1 3 6 4');
    expect(listOf(treeOf(readTree('5 1 _ 1 _ 5') as Token[]))).toBe('5 1 _ 1 _ 5');
    expect(listOf(treeOf(readTree('_') as Token[]))).toBe('_');
  });

  it('solves the empty tree with nothing chosen', () => {
    for (const approach of ['pattern', 'naive'] as const) {
      const end = runSolve('_', { approach }).end;
      expect(end.best).toBe(0);
      expect(end.chosen).toEqual([]);
    }
  });

  it('refuses words, values out of range and too many nodes', () => {
    const t = new Timeline(def, { approach: 'pattern' }, 1, [
      ['build', '3 cat 4'],
      ['build', '3 100'],
      ['build', Array(11).fill(1).join(' ')],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/not a whole number/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/100 is out of range/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/at most 10/);
    expect(listOf(t.endState().nodes)).toBe('4 9 2 1 3 6 4');
  });

  it('reads the input box', () => {
    const parse = def.controls.input!.parse;
    expect(parse('[4, 9, 2, null, 3]')).toBe('4 9 2 _ 3');
    expect(parse('4 x')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
