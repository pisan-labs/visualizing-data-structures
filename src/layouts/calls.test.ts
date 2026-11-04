import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  callShapeId,
  callStackHeight,
  drawCallStack,
  drawCallTree,
  frameShapeId,
  frameWidth,
  layoutCallTree,
  returnShapeId,
  type StackFrame,
  type TreeCall,
} from './calls';

/** A random tree: each new call is made by one of the calls before it. */
const treeArb = fc
  .array(fc.tuple(fc.nat(), fc.constantFrom('f(3)', 'fib(10)', 'x', 'C(5, 2)'), fc.boolean()), {
    minLength: 1,
    maxLength: 40,
  })
  .map((items) =>
    items.map(([p, label, tagged], i): TreeCall => ({
      id: `c${i}`,
      parent: i === 0 ? null : `c${p % i}`,
      label,
      value: i % 3 === 0 ? `= ${i * 7}` : undefined,
      tag: tagged && i > 0 ? '2nd' : undefined,
      state: 'done',
    })),
  );

describe('call tree layout', () => {
  it('never overlaps two boxes on a level and centers parents over their children', () => {
    fc.assert(
      fc.property(treeArb, fc.boolean(), (calls, twoLines) => {
        const gap = 8;
        const layout = layoutCallTree(calls, { gap, twoLines });
        expect(layout.nodes.size).toBe(calls.length);
        const byDepth = new Map<number, { l: number; r: number }[]>();
        for (const n of layout.nodes.values()) {
          const list = byDepth.get(n.depth) ?? [];
          list.push({ l: n.x - n.w / 2, r: n.x + n.w / 2 });
          byDepth.set(n.depth, list);
          expect(n.y).toBe(n.depth * layout.levelGap);
        }
        for (const list of byDepth.values()) {
          list.sort((a, b) => a.l - b.l);
          for (let i = 1; i < list.length; i++)
            expect(list[i]!.l - list[i - 1]!.r).toBeGreaterThanOrEqual(gap - 1e-6);
        }
        for (const c of calls) {
          const kids = calls.filter((k) => k.parent === c.id).map((k) => layout.nodes.get(k.id)!);
          if (kids.length === 0) continue;
          // Children keep the order they were made in, and the parent sits over the middle.
          for (let i = 1; i < kids.length; i++) expect(kids[i]!.x).toBeGreaterThan(kids[i - 1]!.x);
          const mid = (kids[0]!.x + kids[kids.length - 1]!.x) / 2;
          expect(layout.nodes.get(c.id)!.x).toBeCloseTo(mid, 6);
        }
        // Everything drawn lies inside the bounds.
        for (const n of layout.nodes.values()) {
          expect(n.x - n.w / 2).toBeGreaterThanOrEqual(layout.bounds.x - 1e-6);
          expect(n.x + n.w / 2).toBeLessThanOrEqual(layout.bounds.x + layout.bounds.w + 1e-6);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('draws any moment of the finished tree at the finished positions', () => {
    fc.assert(
      fc.property(treeArb, fc.nat(), (calls, k) => {
        const layout = layoutCallTree(calls);
        const made = calls.slice(0, 1 + (k % calls.length));
        const shapes = drawCallTree(layout, made, { dx: 5, dy: 7 });
        const ids = shapes.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const c of made) {
          const box = shapes.find((s) => s.id === callShapeId(c.id));
          const n = layout.nodes.get(c.id)!;
          expect(box).toMatchObject({ kind: 'rect', x: n.x - n.w / 2 + 5, y: n.y - n.h / 2 + 7 });
          if (c.parent !== null) expect(ids).toContain(`${callShapeId(c.id)}-edge`);
          if (c.tag) expect(ids).toContain(`${callShapeId(c.id)}-tagtext`);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('marks the path to the running call and dims finished calls', () => {
    const calls: TreeCall[] = [
      { id: '1', parent: null, label: 'f(2)', state: 'open' },
      { id: '2', parent: '1', label: 'f(1)', state: 'done', value: '= 1' },
      { id: '3', parent: '1', label: 'f(0)', state: 'current' },
    ];
    const shapes = drawCallTree(layoutCallTree(calls), calls);
    const get = (id: string) => shapes.find((s) => s.id === id)!;
    expect(get('call-1').role).toBe('visit');
    expect(get('call-3').role).toBe('active');
    expect(get('call-3-edge').role).toBe('active');
    expect(get('call-2-edge').role).toBeUndefined();
    expect(get('call-2').cls).toBe('call-done');
    expect(get('call-2-value')).toMatchObject({ kind: 'text', text: '= 1' });
  });

  it('refuses a list that is not a tree', () => {
    expect(() =>
      layoutCallTree([
        { id: 'a', parent: null, label: 'a', state: 'done' },
        { id: 'b', parent: null, label: 'b', state: 'done' },
      ]),
    ).toThrow(/Two first calls/);
    expect(() => layoutCallTree([{ id: 'a', parent: 'z', label: 'a', state: 'done' }])).toThrow(
      /unknown parent/,
    );
  });
});

describe('call stack', () => {
  const frames: StackFrame[] = [
    { id: 'main', call: 'main', line: 'waits: x = f(2)', status: 'caller' },
    { id: '1', call: 'f(2)', line: 'waits: 2 * f(1)', status: 'waiting' },
    { id: '2', call: 'f(1)', line: 'return 1', status: 'returning', returns: '1' },
  ];

  it('puts the newest frame on top, inside the room it keeps', () => {
    const { width, lineX } = frameWidth(
      frames,
      frames.map((f) => f.line!),
      [['return 1', '1']],
    );
    const d = drawCallStack(frames, { x: 10, y: 20, width, lineX, room: 6 });
    const ys = frames.map((f) => d.boxes.get(f.id)!.y);
    expect(ys[0]).toBeGreaterThan(ys[1]!);
    expect(ys[1]).toBeGreaterThan(ys[2]!);
    expect(d.bounds).toEqual({ x: 10, y: 20, w: width, h: callStackHeight(6) });
    for (const b of d.boxes.values()) expect(b.y + b.h).toBeLessThanOrEqual(20 + d.bounds.h);
    const get = (id: string) => d.shapes.find((s) => s.id === id)!;
    expect(get(frameShapeId('2')).role).toBe('done');
    expect(get(frameShapeId('main')).cls).toBe('ghost');
  });

  it('keeps a return token’s ids as the value moves from callee to caller', () => {
    const before = drawCallStack(frames, { x: 0, y: 0, width: 220, room: 4 });
    const after = drawCallStack(
      [
        frames[0]!,
        { ...frames[1]!, line: '2 * 1', received: { from: '2', value: '1' }, status: 'running' },
      ],
      { x: 0, y: 0, width: 220, room: 4 },
    );
    const token = returnShapeId('2');
    const a = before.shapes.find((s) => s.id === token)!;
    const b = after.shapes.find((s) => s.id === token)!;
    expect(a.kind).toBe('rect');
    expect(b.kind).toBe('rect');
    if (a.kind === 'rect' && b.kind === 'rect') expect(b.y).toBeGreaterThan(a.y);
    // A frame reused for a tail call keys its token by the call it holds now.
    const reused = drawCallStack(
      [{ id: '1', callId: '6', call: 'f(0, 6)', status: 'returning', returns: '6' }],
      { x: 0, y: 0, width: 200, room: 2 },
    );
    expect(reused.shapes.map((s) => s.id)).toContain(returnShapeId('6'));
  });
});
