import { describe, expect, it } from 'vitest';
import { stackArray } from '../viz/stack-array';
import { interpolate } from '../render/interpolate';
import type { Scene } from '../render/scene';
import {
  decodeExample,
  encodeExample,
  makeExample,
  normalizeSettings,
  validateExample,
} from './example';
import { deriveSeed, makeRng } from './rng';
import { Timeline } from './timeline';

describe('timeline', () => {
  const make = () =>
    new Timeline(stackArray, stackArray.defaults, 1, [
      ['push', 1],
      ['push', 2],
      ['push', 3],
    ]);

  it('indexes steps globally with the starting step at 0', () => {
    const t = make();
    expect(t.at(0).op).toBe(-1);
    expect(t.length).toBe(1 + 3 * 3);
    expect(t.endOf(0)).toBe(3);
    expect(t.at(t.endOf(2)).index).toBe(2);
    expect(t.indexOf(1, 0)).toBe(4);
  });

  it('discards later operations when applying from an earlier point', () => {
    const t = make();
    const { discarded, firstNew } = t.apply([['pop']], t.indexOf(0, 1));
    expect(discarded).toBe(2);
    expect(t.calls).toEqual([['push', 1], ['pop']]);
    expect(t.at(firstNew).op).toBe(1);
    expect(t.endState().size).toBe(0);
  });

  it('applying from the start discards everything', () => {
    const t = make();
    t.apply([['push', 9]], 0);
    expect(t.calls).toEqual([['push', 9]]);
  });

  it('skips fine steps at lower detail levels', () => {
    const t = make();
    const milestones = t.visibleIndices(1);
    expect(milestones).toEqual([0, t.endOf(0), t.endOf(1), t.endOf(2)]);
    expect(t.next(0, 1)).toBe(t.endOf(0));
    expect(t.prev(t.endOf(1), 1)).toBe(t.endOf(0));
    expect(t.next(t.length - 1, 3)).toBeNull();
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const xs = Array.from({ length: 5 }, () => a.int(1, 6));
    expect(Array.from({ length: 5 }, () => b.int(1, 6))).toEqual(xs);
    expect(xs.every((x) => x >= 1 && x <= 6)).toBe(true);
    expect(deriveSeed(1, 0)).not.toBe(deriveSeed(1, 1));
  });
});

describe('examples', () => {
  it('round-trips through a link', async () => {
    const ex = makeExample('stack-array', stackArray.defaults, 5, [['push', 'S'], ['pop']], {
      op: 1,
      step: 0,
    });
    const code = await encodeExample(ex);
    expect(code[0]).toBe('z');
    expect(code).toMatch(/^[\w-]+$/);
    expect(validateExample(stackArray, await decodeExample(code))).toEqual({
      ...ex,
      id: undefined,
      title: undefined,
      notes: undefined,
    });
  });

  it('rejects bad examples with a readable message', () => {
    expect(() => validateExample(stackArray, null)).toThrow(/not an example/);
    expect(() => validateExample(stackArray, { format: 2 })).toThrow(/newer version/);
    expect(() => validateExample(stackArray, { format: 1, viz: 'bst', ops: [] })).toThrow(/"bst"/);
    expect(() =>
      validateExample(stackArray, { format: 1, viz: 'stack-array', ops: [['explode']] }),
    ).toThrow(/Operation 1/);
    expect(() =>
      validateExample(stackArray, { format: 1, viz: 'stack-array', ops: [['push']] }),
    ).toThrow(/Operation 1/);
  });

  it('normalizes settings', () => {
    const s = normalizeSettings(stackArray.settings, stackArray.defaults, {
      capacity: 999,
      top: 'sideways',
      extra: 1,
    });
    expect(s).toEqual({ ...stackArray.defaults, capacity: 16 });
  });

  it('rejects garbage links with a readable message', async () => {
    await expect(decodeExample('qqq')).rejects.toThrow(/not a valid example/);
    await expect(decodeExample('zgarbage')).rejects.toThrow(/not a valid example/);
    await expect(decodeExample('j!!!')).rejects.toThrow(/not a valid example/);
  });
});

describe('interpolate', () => {
  const a: Scene = {
    label: 'a',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    shapes: [
      { kind: 'rect', id: 'r', x: 0, y: 0, w: 10, h: 10 },
      { kind: 'text', id: 'gone', x: 5, y: 5, text: 'bye' },
    ],
  };
  const b: Scene = {
    label: 'b',
    bounds: { x: 0, y: 0, w: 200, h: 100 },
    shapes: [
      { kind: 'rect', id: 'r', x: 100, y: 0, w: 10, h: 10 },
      { kind: 'text', id: 'new', x: 50, y: 50, text: 'hi', enterFrom: { x: 0, y: 0 } },
    ],
  };

  it('moves matched shapes and fades the rest', () => {
    const mid = interpolate(a, b, 0.5);
    const r = mid.shapes.find((s) => s.id === 'r')!;
    expect(r.kind === 'rect' && r.x).toBe(50);
    const n = mid.shapes.find((s) => s.id === 'new')!;
    expect(n.opacity).toBeCloseTo(0.5);
    expect(n.kind === 'text' && n.x).toBe(25);
    expect(mid.shapes.find((s) => s.id === 'gone')!.opacity).toBeCloseTo(0.5);
    expect(mid.bounds.w).toBe(150);
  });

  it('lands exactly on the target', () => {
    const end = interpolate(a, b, 1);
    expect(end.shapes.map((s) => s.id).sort()).toEqual(['new', 'r']);
  });
});
