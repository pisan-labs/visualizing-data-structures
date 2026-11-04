/**
 * Checks every visualization in the registry must pass. New visualizations get these for free.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateExample } from '../engine/example';
import { makeRng } from '../engine/rng';
import { Timeline } from '../engine/timeline';
import type { AnyVizDef, OpCall, Settings, Value } from '../engine/types';
import type { Shape } from '../render/scene';
import { families } from './catalog';
import { vizPaths, vizzes } from './registry';

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
    ...def.controls.buttons.map((b) => {
      if (!b.usesInput) return fc.constant([b.op] as OpCall);
      const n = b.args?.length ?? 1;
      return n === 1
        ? valueArb.map((v) => [b.op, v] as OpCall)
        : fc.array(valueArb, { minLength: n, maxLength: n }).map((vs) => [b.op, ...vs] as OpCall);
    }),
  );
}

function checkTimeline(def: AnyVizDef, t: Timeline<unknown, Settings, unknown>) {
  const lineIds = new Set(def.pseudocode(t.settings).flatMap((b) => b.lines.map((l) => l.id)));
  for (let i = 0; i < t.length; i++) {
    const { step } = t.at(i);
    expect(step.say.trim().length, `step ${i} has narration`).toBeGreaterThan(0);
    expect(step.say, `step ${i} narration has no template leftovers`).not.toMatch(
      /\{[\w.]+\}|\bundefined\b|\bNaN\b|\[object Object\]/,
    );
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
  it('lives in a folder named after its id and is listed in the catalog', () => {
    const path = Object.keys(vizPaths).find((p) => vizPaths[p] === def);
    expect(path).toBe(`./${def.id}/index.ts`);
    expect(families.flatMap((f) => f.items.map((i) => i.id))).toContain(def.id);
  });

  it('has controls for real operations', () => {
    for (const b of def.controls.buttons) {
      expect(def.ops[b.op], b.op).toBeDefined();
      const values = b.usesInput ? (b.args?.length ?? 1) : 0;
      expect(def.ops[b.op]!.arity, `${b.op} takes what its button gives it`).toBe(values);
    }
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
    const links = [...def.explain.matchAll(/\(#(?:example|play):([\w-]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    const ids = def.examples.map((e) => e.id);
    for (const l of links) expect(ids).toContain(l);
  });

  it('has no placeholder text in what learners read', () => {
    const texts = [def.explain, def.blurb, ...def.examples.map((e) => `${e.title} ${e.notes}`)];
    for (const t of texts) expect(t).not.toMatch(/\bTODO\b|\?\?\?|future work|lorem ipsum/i);
  });

  it('has plain-English pseudocode for every line, in every setting', () => {
    for (const settings of settingsSamples(def)) {
      for (const b of def.pseudocode(settings)) {
        for (const l of b.lines) expect(l.plain.trim(), `${b.op}/${l.id}`).not.toBe('');
      }
    }
  });

  it('has a Big-O self-test whose examples exist', () => {
    expect(def.complexity.length).toBeGreaterThan(0);
    const ids = def.examples.map((e) => e.id);
    for (const row of def.complexity) {
      for (const c of [row.best, row.average, row.worst]) {
        expect(c.cost.trim()).not.toBe('');
        expect(c.why.trim()).not.toBe('');
        if (c.example) expect(ids, `${row.op}: example ${c.example}`).toContain(c.example);
      }
    }
  });

  it('offers presets that run cleanly', () => {
    for (const p of def.controls.presets ?? []) {
      for (const size of def.controls.sizes ?? [5, 8, 12]) {
        const calls = p.make(makeRng(3), size);
        expect(calls.length, p.label).toBeGreaterThan(0);
        checkTimeline(def, new Timeline(def, { ...def.defaults }, 3, calls));
      }
    }
  });
});

/** Default settings plus each choice option on its own, so every variant is covered once. */
function settingsSamples(def: AnyVizDef): Settings[] {
  const out: Settings[] = [{ ...def.defaults }];
  for (const s of def.settings) {
    if (s.kind === 'choice')
      for (const o of s.options) out.push({ ...def.defaults, [s.key]: o.value });
    if (s.kind === 'boolean') out.push({ ...def.defaults, [s.key]: !def.defaults[s.key] });
  }
  return out;
}
