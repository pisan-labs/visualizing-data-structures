import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { persistentBst } from '.';
import { MAX_VERSIONS, reach, type PersistentState } from './model';

// Reference: each version as its own mutable BST, copied whole before every update.
interface RN {
  key: number;
  left: RN | null;
  right: RN | null;
}
const clone = (t: RN | null): RN | null =>
  t && { key: t.key, left: clone(t.left), right: clone(t.right) };
const has = (t: RN | null, k: number): boolean =>
  !!t && (t.key === k || has(k < t.key ? t.left : t.right, k));
function ins(t: RN | null, k: number): RN {
  if (!t) return { key: k, left: null, right: null };
  if (k < t.key) t.left = ins(t.left, k);
  else t.right = ins(t.right, k);
  return t;
}
function del(t: RN | null, k: number): RN | null {
  if (!t) return null;
  if (k < t.key) t.left = del(t.left, k);
  else if (k > t.key) t.right = del(t.right, k);
  else {
    if (!t.left) return t.right;
    if (!t.right) return t.left;
    let y = t.right;
    while (y.left) y = y.left;
    t.key = y.key;
    t.right = del(t.right, y.key);
  }
  return t;
}
const pre = (t: RN | null): number[] => (t ? [t.key, ...pre(t.left), ...pre(t.right)] : []);
const depth = (t: RN | null, k: number, d = 0): number =>
  t!.key === k ? d : depth(k < t!.key ? t!.left : t!.right, k, d + 1);

function modelPre(s: PersistentState, root: number | null): number[] {
  return root === null
    ? []
    : [
        s.nodes[root]!.key,
        ...modelPre(s, s.nodes[root]!.left),
        ...modelPre(s, s.nodes[root]!.right),
      ];
}

const keyArb = fc.integer({ min: 1, max: 30 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 5, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 3, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 1, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 9 }).map((v) => ['view', v] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

const run = (calls: OpCall[]) => new Timeline(persistentBst, persistentBst.defaults, 1, calls);

describe('persistent BST', () => {
  it('keeps every version exactly as a full copy would, and never changes a node', () => {
    fc.assert(
      fc.property(fc.array(callArb, { maxLength: 40 }), (calls) => {
        const t = run(calls);
        let versions: (RN | null)[] = [null];
        let current = 0;
        let prev = t.initial.state;
        calls.forEach((call, i) => {
          const [op, raw] = call;
          const k = Number(raw);
          const e = t.entries[i]!;
          const full = versions.length >= MAX_VERSIONS;
          let made = 0;
          if (op === 'insert' && !full && !has(versions[current]!, k)) {
            made = depth(ins(clone(versions[current]!), k), k) + 1;
            versions.push(ins(clone(versions[current]!), k));
            current = versions.length - 1;
          } else if (op === 'delete' && !full && has(versions[current]!, k)) {
            versions.push(del(clone(versions[current]!), k));
            current = versions.length - 1;
          } else if (op === 'view' && k < versions.length) current = k;
          else if (op === 'clear') {
            versions = [null];
            current = 0;
          }
          const s = e.end;
          expect(s.versions.length).toBe(versions.length);
          expect(s.current).toBe(current);
          versions.forEach((root, v) =>
            expect(modelPre(s, s.versions[v]!.root)).toEqual(pre(root)),
          );
          if (op === 'insert' && made > 0)
            expect(Object.keys(s.nodes).length - Object.keys(prev.nodes).length).toBe(made);
          // Path copying never changes a node that already exists.
          if (op !== 'clear')
            for (const step of e.steps)
              for (const [u, n] of Object.entries(prev.nodes))
                expect(step.state.nodes[Number(u)]).toEqual(n);
          // Each version is a BST.
          for (const v of s.versions) {
            const keys: number[] = [];
            const walk = (u: number | null) => {
              if (u === null) return;
              walk(s.nodes[u]!.left);
              keys.push(s.nodes[u]!.key);
              walk(s.nodes[u]!.right);
            };
            walk(v.root);
            expect(keys).toEqual([...keys].sort((a, b) => a - b));
            expect(new Set(keys).size).toBe(keys.length);
          }
          expect(e.steps.at(-1)!.vars!.N).toBe(reach(s, s.versions[s.current]!.root).length);
          prev = s;
        });
      }),
      { numRuns: 300 },
    );
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(persistentBst, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(persistentBst, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
