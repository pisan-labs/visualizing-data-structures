import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { textWidth } from '../../layouts/text';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { families as catalog } from '../catalog';
import { liveIds } from '../registry';
import { PATTERNS } from '../_patterns/kit';
import { patternMap as def } from '.';
import {
  CUES,
  FAMILIES,
  NODES,
  PROBLEMS,
  cue,
  cuesOf,
  familyCues,
  familyOf,
  node,
  pageText,
  type Problem,
} from './map';
import { defaults, findCue, findFamily, findProblem, shownFinds, type PmSettings } from './model';
import { CUE_W, T } from './view';

const CONCURRENCY = catalog.find((f) => f.name === 'Concurrency')!.items.map((i) => i.id);

/** Every place a substring occurs, as [start, end) pairs. */
function spans(text: string, words: string): [number, number][] {
  const out: [number, number][] = [];
  for (let i = text.indexOf(words); i >= 0; i = text.indexOf(words, i + 1))
    out.push([i, i + words.length]);
  return out;
}

/** The reference reading of a problem: the pattern most of its cues that are not traps point to. */
function referenceAnswer(p: Problem): string {
  const votes = new Map<string, number>();
  for (const f of p.finds)
    if (!f.trap) votes.set(cue(f.cue).node, (votes.get(cue(f.cue).node) ?? 0) + 1);
  return [...votes].sort((a, b) => b[1] - a[1])[0]![0];
}

describe('the map', () => {
  it('has every pattern and every Concurrency page as a node, each in one family', () => {
    const ids = NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(NODES.map((n) => n.name)).size).toBe(ids.length);
    for (const p of PATTERNS) expect(ids, p.id).toContain(p.id);
    for (const id of CONCURRENCY) expect(ids, id).toContain(id);
    expect(ids.length).toBe(PATTERNS.length + CONCURRENCY.length);
    const placed = FAMILIES.flatMap((f) => f.nodes);
    expect([...placed].sort()).toEqual([...ids].sort());
  });

  it('names its families after catalog families, and pages after catalog items', () => {
    const names = new Set(catalog.map((f) => f.name));
    for (const f of FAMILIES) expect(names.has(f.name), f.name).toBe(true);
    const items = new Set(catalog.flatMap((f) => f.items.map((i) => i.id)));
    for (const n of NODES) expect(items.has(n.page), n.page).toBe(true);
    // The pathway's own families keep their catalog members together on the map.
    for (const f of FAMILIES) {
      const cat = catalog.find((c) => c.name === f.name)!;
      if (!cat.pathways.includes('interviews')) continue;
      for (const item of cat.items) expect(f.nodes, `${f.name}: ${item.id}`).toContain(item.id);
    }
  });

  it('gives every node one to three cues, short, distinct and listed in map order', () => {
    expect(new Set(CUES.map((q) => q.id)).size).toBe(CUES.length);
    const texts = CUES.map((q) => q.text.toLowerCase());
    expect(new Set(texts).size).toBe(CUES.length);
    for (const n of NODES) {
      expect(cuesOf(n.id).length, n.id).toBeGreaterThanOrEqual(1);
      expect(cuesOf(n.id).length, n.id).toBeLessThanOrEqual(3);
    }
    expect(FAMILIES.flatMap((_, f) => familyCues(f))).toEqual([...CUES]);
    for (const q of CUES) {
      // ASCII, so the code tabs read them the same in every language, and one line on the map.
      expect(q.text, q.id).toMatch(/^[\x20-\x7e]+$/);
      expect(textWidth(q.text, T), q.text).toBeLessThanOrEqual(CUE_W - 12);
      expect(q.why.trim().length, q.id).toBeGreaterThan(20);
    }
  });

  it('keeps its problems well formed: finds in the text, traps elsewhere, filler apart', () => {
    expect(PROBLEMS.length).toBeGreaterThanOrEqual(8);
    expect(PROBLEMS.length).toBeLessThanOrEqual(12);
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(PROBLEMS.length);
    // Across the families: at least eight of them have a problem.
    expect(new Set(PROBLEMS.map((p) => familyOf(p.answer))).size).toBeGreaterThanOrEqual(8);
    for (const p of PROBLEMS) {
      const taken: [number, number][] = [];
      for (const w of [...p.finds.map((f) => f.words), ...p.filler]) {
        const at = spans(p.text, w);
        expect(at.length, `${p.id}: “${w}” appears once`).toBe(1);
        const [a, b] = at[0]!;
        for (const [c, d] of taken) expect(b <= c || d <= a, `${p.id}: “${w}” overlaps`).toBe(true);
        taken.push([a, b]);
      }
      const order = p.finds.map((f) => p.text.indexOf(f.words));
      expect(order, `${p.id}: finds in text order`).toEqual([...order].sort((x, y) => x - y));
      expect(
        p.finds.some((f) => !f.trap),
        p.id,
      ).toBe(true);
      for (const f of p.finds) {
        const to = cue(f.cue).node;
        if (f.trap) {
          expect(to, `${p.id}: a trap points elsewhere`).not.toBe(p.answer);
          expect(f.but?.trim(), p.id).toBeTruthy();
        } else expect(to, `${p.id}: “${f.words}”`).toBe(p.answer);
      }
      expect(new Set(p.finds.map((f) => f.cue)).size, `${p.id}: one find per cue`).toBe(
        p.finds.length,
      );
      for (const id of [...p.near, ...(p.alsoFits ?? [])]) node(id);
      expect(p.near, p.id).not.toContain(p.answer);
      expect(
        p.near.some((id) => p.alsoFits?.includes(id)),
        p.id,
      ).toBe(false);
      expect(p.filler.length, p.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('finds what the learner types: cues, families and problems', () => {
    for (const q of CUES) {
      expect(findCue(q.text)?.id).toBe(q.id);
      expect(findCue(`“${q.text.toUpperCase()}”`)?.id).toBe(q.id);
    }
    expect(findCue('find the k largest values in a list')?.id).toBe('tk-largest');
    expect(findCue('zebra')).toBeNull();
    expect(findCue('17')).toBeNull();
    FAMILIES.forEach((f, k) => {
      expect(findFamily(f.name)).toBe(k);
      expect(findFamily(String(k + 1))).toBe(k);
    });
    expect(findFamily('the k largest')).toBe(familyOf('top-k'));
    expect(findFamily('Deadlock')).toBe(familyOf('deadlock'));
    expect(findFamily('0')).toBe(-1);
    expect(findFamily('12')).toBe(-1);
    PROBLEMS.forEach((p, k) => {
      expect(findProblem(String(k + 1))).toBe(k);
      expect(findProblem(p.title)).toBe(k);
    });
    expect(findProblem('the k largest')).toBe(PROBLEMS.findIndex((p) => p.answer === 'top-k'));
    expect(findProblem('13')).toBe(-1);
    expect(findProblem('A')).toBe(-1);
  });

  it('links a page only when it is live', () => {
    for (const n of NODES)
      expect(pageText(n.id)).toBe(liveIds.includes(n.page) ? `/${n.page}/` : 'page not live yet');
  });
});

const settingsArb = fc.record({ lookalikes: fc.boolean(), naive: fc.boolean() });
const inputArb = fc.oneof(
  fc.constantFrom(...CUES.map((q) => q.text)),
  fc.constantFrom(...FAMILIES.map((f) => f.name)),
  fc.integer({ min: -2, max: 14 }).map(String),
  fc.constantFrom('zebra', 'A', 'cat', 'heap', 'the k largest', 'lru'),
);
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  inputArb.map((v): OpCall => ['pick', v]),
  inputArb.map((v): OpCall => ['family', v]),
  inputArb.map((v): OpCall => ['which', v]),
  fc.constant<OpCall>(['map']),
);

describe('pattern-map', () => {
  it('follows every cue to its pattern and page, and reads every problem to its answer', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 8 }), (s, calls) => {
        const settings: PmSettings = { ...defaults, ...s };
        const t = new Timeline(def, settings, 1, calls);
        for (const e of t.entries) {
          const [op, arg] = e.call;
          const last = e.steps.at(-1)!;
          const refused = last.lines.some((l) => l.endsWith('.sig'));
          for (const step of e.steps) {
            const st = step.state;
            // Every step is in one view, with only that view's fields set.
            if (st.mode === 'family') {
              const fam = FAMILIES[st.family]!;
              if (st.cue) expect(fam.nodes).toContain(cue(st.cue).node);
              if (st.node) expect(fam.nodes).toContain(st.node);
              expect(st.problem).toBe(-1);
            } else if (st.mode === 'problem') {
              const finds = shownFinds(PROBLEMS[st.problem]!, settings);
              expect(st.hopped).toBeLessThanOrEqual(st.read);
              expect(st.read).toBeLessThanOrEqual(finds.length);
              expect(st.read - st.hopped).toBeLessThanOrEqual(1);
            } else {
              expect(st.cue).toBeNull();
              expect(st.problem).toBe(-1);
            }
          }
          if (refused) continue;
          if (op === 'pick') {
            const q = findCue(String(arg))!;
            expect(e.end).toMatchObject({ mode: 'family', cue: q.id, node: q.node, page: true });
            expect(e.end.family).toBe(familyOf(q.node));
            expect(e.steps.length).toBe(3);
          } else if (op === 'family') {
            const f = findFamily(String(arg));
            expect(e.end).toMatchObject({ mode: 'family', family: f, node: null });
            // A step for the family, one per pattern in order, and the last.
            const walked = e.steps.slice(1, -1).map((x) => x.state.node);
            expect(walked).toEqual(FAMILIES[f]!.nodes);
          } else if (op === 'which') {
            const p = PROBLEMS[findProblem(String(arg))]!;
            const finds = shownFinds(p, settings);
            expect(e.end.node).toBe(referenceAnswer(p));
            expect(e.end.page).toBe(true);
            expect(e.end.read).toBe(finds.length);
            expect(e.steps.length).toBe(2 + 2 * finds.length);
            expect(finds.some((f) => f.trap)).toBe(
              settings.lookalikes && p.finds.some((f) => f.trap),
            );
          } else {
            expect(e.end).toEqual(def.init(settings));
            expect(e.steps.length).toBe(FAMILIES.length + 1);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('says what the naive way costs only when asked to', () => {
    for (const naive of [true, false]) {
      const t = new Timeline(def, { ...defaults, naive }, 1, [['pick', 'the k largest']]);
      const say = t.at(t.length - 1).step.say;
      expect(say.includes('The naive way: sort everything, O(n log n).')).toBe(naive);
      expect(say).toContain('/top-k/');
    }
    const t = new Timeline(def, defaults, 1, [['pick', 'two locks, opposite orders']]);
    expect(t.at(t.length - 1).step.say).toContain('The fix: one global lock order.');
  });

  it('rules out a look-alike, or skips it when look-alikes are off', () => {
    const run = (lookalikes: boolean) =>
      new Timeline(def, { ...defaults, lookalikes }, 1, [['which', '2']]);
    const on = run(true);
    expect(on.at(on.length - 1).step.say).toContain('Sliding window is ruled out.');
    expect(on.at(on.length - 1).step.vars?.['look-alikes']).toBe(1);
    const off = run(false);
    expect(off.at(off.length - 1).step.say).not.toContain('ruled out');
    expect(off.length).toBe(on.length - 2);
  });

  it('draws text large enough to read on a laptop and a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
    // Not only the curated examples: every family and every problem, with look-alikes.
    const calls: OpCall[] = [
      ...FAMILIES.map((_, f): OpCall => ['family', String(f + 1)]),
      ...PROBLEMS.map((_, p): OpCall => ['which', String(p + 1)]),
    ];
    const t = new Timeline(def, defaults, 1, calls);
    for (const [stage, least] of [
      [LAPTOP_STAGE, 11],
      [PHONE_STAGE, 9],
    ] as const)
      for (let i = 0; i < t.length; i++) {
        const scene = def.view(t.at(i).step, defaults, stage);
        const scale = Math.min(stage.w / scene.bounds.w, stage.h / scene.bounds.h);
        for (const s of scene.shapes)
          if (s.kind === 'text') expect((s.size ?? 16) * scale, s.id).toBeGreaterThanOrEqual(least);
      }
  });

  it('links from the concept page only to live pages', () => {
    const links = [...def.explain.matchAll(/\]\(\/([\w-]+)\/\)/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThan(0);
    for (const id of links) expect(liveIds, id).toContain(id);
  });

  it('matches the code tabs’ table to the map', () => {
    for (const lang of ['python', 'java', 'cpp'] as const) {
      const src = def.code![lang];
      for (const q of CUES) expect(src, `${lang}: ${q.text}`).toContain(`"${q.text}", "${q.node}"`);
      for (const f of FAMILIES) expect(src, `${lang}: ${f.name}`).toContain(`"${f.name}"`);
    }
  });
});
