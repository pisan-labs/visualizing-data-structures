/**
 * Checks every visualization in the registry must pass. New visualizations get these for free.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateExample } from '../engine/example';
import { Timeline } from '../engine/timeline';
import type { AnyVizDef, OpCall, Settings, Value } from '../engine/types';
import type { Shape } from '../render/scene';
import { vizzes } from './registry';

function settingsArb(def: AnyVizDef): fc.Arbitrary<Settings> {
  const parts: Record<string, fc.Arbitrary<unknown>> = {};
  for (const s of def.settings) {
    if (s.kind === 'choice') parts[s.key] = fc.constantFrom(...s.options.map((o) => o.value));
    else if (s.kind === 'number') parts[s.key] = fc.integer({ min: s.min, max: s.max });
    else parts[s.key] = fc.boolean();
  }
  return fc.record(parts).map((p) => ({ ...def.defaults, ...p }) as Settings);
}

const valueArb: fc.Arbitrary<Value> = fc.oneof(
  fc.integer({ min: -99, max: 999 }),
  fc.constantFrom('A', 'B', 'cat', 'zebra'),
);

function callArb(def: AnyVizDef): fc.Arbitrary<OpCall> {
  return fc.oneof(
    ...def.controls.buttons.map((b) =>
      b.usesInput ? valueArb.map((v) => [b.op, v] as OpCall) : fc.constant([b.op] as OpCall),
    ),
  );
}

function checkTimeline(def: AnyVizDef, t: Timeline<unknown, Settings, unknown>) {
  const lineIds = new Set(def.pseudocode(t.settings).flatMap((b) => b.lines.map((l) => l.id)));
  for (let i = 0; i < t.length; i++) {
    const { step } = t.at(i);
    expect(step.say.trim().length, `step ${i} has narration`).toBeGreaterThan(0);
    expect([1, 2, 3]).toContain(step.level);
    for (const id of step.lines)
      expect(lineIds.has(id), `pseudocode line "${id}" exists`).toBe(true);
    const scene = def.view(step, t.settings);
    const ids = scene.shapes.map((s: Shape) => s.id);
    expect(new Set(ids).size, `step ${i} shape ids are unique`).toBe(ids.length);
    for (const m of step.marks) expect(ids, `mark "${m.id}" points at a shape`).toContain(m.id);
    expect(scene.label.length).toBeGreaterThan(0);
  }
  for (const e of t.entries) {
    expect(e.steps.at(-1)!.level, 'last step of an operation is a milestone').toBe(1);
    expect(e.steps.at(-1)!.state, 'last step shows the final state').toEqual(e.end);
  }
}

describe.each(vizzes.map((v) => [v.id, v] as const))('%s', (_id, def) => {
  it('has controls for real operations', () => {
    for (const b of def.controls.buttons) expect(def.ops[b.op], b.op).toBeDefined();
  });

  it('passes the step checks for random operation sequences', () => {
    fc.assert(
      fc.property(
        settingsArb(def),
        fc.array(callArb(def), { maxLength: 25 }),
        (settings, calls) => {
          checkTimeline(def, new Timeline(def, settings, 7, calls));
        },
      ),
      { numRuns: 150 },
    );
  });

  it('replays every curated example', () => {
    expect(def.examples.length).toBeGreaterThanOrEqual(3);
    const ids = new Set<string>();
    for (const raw of def.examples) {
      const ex = validateExample(def, raw);
      expect(ex.id, 'curated examples have ids').toBeTruthy();
      expect(ex.title).toBeTruthy();
      ids.add(ex.id!);
      checkTimeline(def, new Timeline(def, ex.settings, ex.seed, ex.ops));
    }
    expect(ids.size).toBe(def.examples.length);
  });

  it('links from the concept page only to examples that exist', () => {
    const links = [...def.explain.matchAll(/\(#example:([\w-]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    const ids = def.examples.map((e) => e.id);
    for (const l of links) expect(ids).toContain(l);
  });
});
