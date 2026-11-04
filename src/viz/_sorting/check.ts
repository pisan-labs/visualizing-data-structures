/**
 * Invariants shared by the sorting pages' property tests. Imported only by tests.
 */
import fc from 'fast-check';
import { expect } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { Settings, VizDef } from '../../engine/types';
import {
  MAX_N,
  MAX_VALUE,
  valuesOf,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
} from './kit';

export const valuesArb = (min = 1) =>
  fc.array(fc.integer({ min: 0, max: MAX_VALUE }), { minLength: min, maxLength: MAX_N });

/** Small arrays with many repeats, to catch stability and tie-handling bugs. */
export const repeatsArb = fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 12 });

export const ascending = (vs: number[]) => [...vs].sort((x, y) => x - y);

export function inversions(vs: number[]): number {
  let k = 0;
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++) if (vs[i]! > vs[j]!) k++;
  return k;
}

/** The values a step holds: live values in A and the aux row, plus a held value with a uid. */
export function liveValues(step: ArrayStep): number[] {
  const e = step.extra ?? {};
  const out = step.state.a.filter((x) => !x.stale).map((x) => x.value);
  for (const x of e.aux?.items ?? []) if (x && !x.stale) out.push(x.value);
  if (e.held?.uid !== undefined) out.push(e.held.value);
  return out;
}

/** Checks for one step of a sort of `values`. */
export function checkSortStep(step: ArrayStep, values: number[]): void {
  const ref = ascending(values);
  // Nothing is lost or duplicated.
  expect(ascending(liveValues(step))).toEqual(ref);
  // Live values have distinct uids.
  const uids = step.state.a.filter((x) => !x.stale).map((x) => x.uid);
  const aux = (step.extra?.aux?.items ?? []).filter((x) => x && !x.stale).map((x) => x!.uid);
  const all = [...uids, ...aux];
  expect(new Set(all).size).toBe(all.length);
  // A value marked done is in its final place.
  for (const m of step.marks) {
    if (m.role !== 'done') continue;
    const i = step.state.a.findIndex((x) => `v${x.uid}` === m.id && !x.stale);
    if (i >= 0) expect(step.state.a[i]!.value, `${m.id} is final`).toBe(ref[i]);
  }
  // Regions shown as sorted are sorted.
  for (const r of step.extra?.regions ?? []) {
    if (r.tone !== 'done' && !r.label?.startsWith('sorted')) continue;
    const part = step.state.a.slice(r.from, r.to + 1);
    // A sorted part may have one hole in it while a value is being inserted.
    const vs = part.filter((x) => !x.stale).map((x) => x.value);
    expect(vs, `region ${r.id} is sorted`).toEqual(ascending(vs));
    if (r.tone === 'done') {
      expect(part.every((x) => !x.stale)).toBe(true);
      expect(vs).toEqual(ref.slice(r.from, r.to + 1));
    }
  }
  // Pointers point into or just outside the array.
  for (const p of step.extra?.pointers ?? []) {
    expect(p.at).toBeGreaterThanOrEqual(-1);
    expect(p.at).toBeLessThanOrEqual(values.length);
  }
}

/** Load `values`, sort them, and check every step and the result. Returns the sort's steps. */
export function checkSort<S extends Settings>(
  def: VizDef<ArrayState, S, ArrayExtra>,
  settings: S,
  values: number[],
  opts: { stable?: boolean; seed?: number } = {},
): ArrayStep[] {
  const t = new Timeline(def, settings, opts.seed ?? 1, [['load', values.join(' ')], ['sort']]);
  const steps = t.entries[1]!.steps;
  const end = t.endState();
  expect(valuesOf(end)).toEqual(ascending(values));
  expect(end.a.every((x) => !x.stale)).toBe(true);
  let last: Record<string, number> = {};
  for (const step of steps) {
    checkSortStep(step, values);
    // Counters never go down.
    for (const [k, v] of Object.entries(step.vars ?? {})) {
      if (
        ['comparisons', 'swaps', 'writes', 'shifts', 'copies'].includes(k) &&
        typeof v === 'number'
      ) {
        expect(v).toBeGreaterThanOrEqual(last[k] ?? 0);
        last = { ...last, [k]: v };
      }
    }
  }
  if (opts.stable) {
    // Equal values keep the order they were loaded in; uids were handed out left to right.
    const byValue = new Map<number, number[]>();
    for (const x of end.a) byValue.set(x.value, [...(byValue.get(x.value) ?? []), x.uid]);
    for (const uids of byValue.values()) expect(uids).toEqual([...uids].sort((p, q) => p - q));
  }
  return steps;
}

/** The counters on the last step of a run. */
export function counters(steps: ArrayStep[]): Record<string, number> {
  const vars = steps[steps.length - 1]!.vars ?? {};
  return Object.fromEntries(
    Object.entries(vars).filter((e): e is [string, number] => typeof e[1] === 'number'),
  );
}
