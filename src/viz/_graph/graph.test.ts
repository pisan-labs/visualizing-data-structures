import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import {
  drawColumn,
  drawGraph,
  drawRow,
  drawTable,
  fitScore,
  layoutGraph,
  placePanels,
  type GraphTemplate,
} from '../../layouts/graph';
import type { Shape } from '../../render/scene';
import {
  MAX_EDGES,
  MAX_VERTICES,
  compareNames,
  components,
  describeGraph,
  findEdge,
  inNeighbours,
  isAcyclic,
  isForest,
  neighbours,
  sortNames,
  withEdge,
  withVertex,
  withoutEdge,
  withoutVertex,
} from './graph';
import { parseGraph } from './parse';
import {
  completeGraph,
  cycleGraph,
  graphPresets,
  gridGraph,
  pathGraph,
  randomDag,
  randomGraph,
  randomTree,
  starGraph,
  twoComponents,
} from './presets';

const g = (text: string) => parseGraph(text) as Exclude<ReturnType<typeof parseGraph>, Error>;

describe('name order', () => {
  it('sorts numbers by value, letters alphabetically, capitals first', () => {
    expect(sortNames(['10', '9', 'B', 'a', 'A', 'v10', 'v2', '_', '01', '1'])).toEqual([
      '01',
      '1',
      '9',
      '10',
      'A',
      'B',
      '_',
      'a',
      'v2',
      'v10',
    ]);
  });

  it('is a total order', () => {
    const name = fc.stringMatching(/^[A-Za-z0-9_]{1,3}$/);
    fc.assert(
      fc.property(name, name, name, (a, b, c) => {
        expect(Math.sign(compareNames(a, b)) + Math.sign(compareNames(b, a))).toBe(0);
        expect(compareNames(a, b) === 0).toBe(a === b);
        if (compareNames(a, b) < 0 && compareNames(b, c) < 0)
          expect(compareNames(a, c)).toBeLessThan(0);
      }),
      { numRuns: 2000 },
    );
  });
});

describe('graph queries', () => {
  it('lists neighbours in name order, out and in', () => {
    const u = g('C-A, B-A, A-10, A-2');
    expect(neighbours(u, 'A')).toEqual(['2', '10', 'B', 'C']);
    const d = g('A>C, A>B, C>A, B>C');
    expect(neighbours(d, 'A')).toEqual(['B', 'C']);
    expect(inNeighbours(d, 'C')).toEqual(['A', 'B']);
    expect(neighbours(d, 'Z')).toEqual([]);
  });

  it('finds edges either way round only when undirected', () => {
    expect(findEdge(g('A-B'), 'B', 'A')).toBeDefined();
    expect(findEdge(g('A>B'), 'B', 'A')).toBeUndefined();
  });

  it('splits into components and spots cycles', () => {
    expect(components(g('A-B, C-D, E'))).toEqual([['A', 'B'], ['C', 'D'], ['E']]);
    expect(components(g('A>B, C>B'))).toEqual([['A', 'B', 'C']]);
    expect(isAcyclic(g('A>B, B>C, A>C'))).toBe(true);
    expect(isAcyclic(g('A>B, B>C, C>A'))).toBe(false);
    expect(isForest(g('A-B, B-C, D'))).toBe(true);
    expect(isForest(g('A-B, B-C, C-A'))).toBe(false);
  });

  it('updates without changing the original', () => {
    const a = g('A-B, B-C');
    const b = withEdge(withVertex(a, 'D'), 'D', 'A');
    expect(b.edges.map((e) => `${e.u}-${e.v}`)).toEqual(['A-B', 'A-D', 'B-C']);
    expect(a.vertices).toEqual(['A', 'B', 'C']);
    expect(withoutVertex(b, 'A').edges.map((e) => `${e.u}-${e.v}`)).toEqual(['B-C']);
    expect(withoutEdge(b, 'C', 'B').edges).toHaveLength(2);
  });

  it('describes a graph in words', () => {
    expect(describeGraph(g('A-B, A-C:3, D'))).toBe(
      'A weighted undirected graph with 4 vertices and 2 edges. A with B (weight 1), C (weight 3); B with A (weight 1); C with A (weight 3); D has no edges.',
    );
    expect(describeGraph(g('A>B'))).toBe(
      'A directed graph with 2 vertices and 1 edge. A to B; B has no edges out.',
    );
  });
});

describe('presets', () => {
  it('make the named shapes', () => {
    expect(pathGraph(4).edges).toHaveLength(3);
    expect(cycleGraph(5).edges).toHaveLength(5);
    expect(starGraph(6).edges.every((e) => e.u === 'A')).toBe(true);
    expect(completeGraph(12).vertices).toHaveLength(8);
    expect(completeGraph(5).edges).toHaveLength(10);
    expect(gridGraph(9).edges).toHaveLength(12);
    expect(gridGraph(5).edges).toHaveLength(5);
  });

  it('make seeded random graphs that stay within the limits', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const rng = makeRng(seed);
      const n = rng.int(1, MAX_VERTICES);
      const tree = randomTree(rng, n);
      expect(isForest(tree)).toBe(true);
      expect(components(tree)).toHaveLength(1);
      const dag = randomDag(rng, n, rng.next());
      expect(dag.directed && isAcyclic(dag)).toBe(true);
      const two = twoComponents(rng, n);
      expect(components(two)).toHaveLength(2);
      const r = randomGraph(rng, n, { density: rng.next(), directed: seed % 2 === 0 });
      expect(r.edges.length).toBeLessThanOrEqual(MAX_EDGES);
      expect(components(r)).toHaveLength(1);
      // The same seed gives the same graph.
      const again = makeRng(seed);
      again.int(1, MAX_VERTICES);
      expect(randomTree(again, n)).toEqual(tree);
    }
  });

  it('load valid graph text and then run what the page asks for', () => {
    for (const p of graphPresets({ then: (x) => [['run', x.vertices[0]!]] })) {
      for (const size of [1, 5, 8, 12, 16]) {
        const calls = p.make(makeRng(size), size);
        expect(calls[0]![0]).toBe('load');
        expect(parseGraph(String(calls[0]![1]))).not.toBeInstanceOf(Error);
        expect(calls[1]).toEqual(['run', 'A']);
      }
    }
  });
});

describe('layouts', () => {
  const templates: GraphTemplate[] = ['force', 'circle', 'grid', 'layered'];

  it('place every vertex apart from the others, the same way every time', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rng = makeRng(seed);
      const graph = randomGraph(rng, rng.int(1, MAX_VERTICES), {
        density: rng.next() * 0.5,
        directed: seed % 3 === 0,
        connected: seed % 4 !== 0,
      });
      for (const t of templates) {
        const L = layoutGraph(graph, t);
        const pts = graph.vertices.map((v) => L.pos[v]!);
        for (const p of pts) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        for (let i = 0; i < pts.length; i++)
          for (let j = i + 1; j < pts.length; j++)
            expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y), t).toBeGreaterThan(
              2 * L.r + 8,
            );
        expect(layoutGraph(structuredClone(graph), t).pos).toEqual(L.pos);
      }
    }
  });

  it('puts the layers of a DAG top to bottom and a tree under its root', () => {
    const dag = g('A>B, A>C, B>D, C>D, D>E');
    const L = layoutGraph(dag, 'layered');
    expect(L.pos.A!.y).toBeLessThan(L.pos.B!.y);
    expect(L.pos.B!.y).toBe(L.pos.C!.y);
    expect(L.pos.D!.y).toBeLessThan(L.pos.E!.y);
    const cyclic = layoutGraph(g('A>B, B>C, C>A'), 'layered');
    expect(cyclic.pos.A!.y).toBeLessThan(cyclic.pos.C!.y);
  });

  it('draws state with a shape or dash as well as a color', () => {
    const graph = g('A-B, B-C, A-C');
    const L = layoutGraph(graph, 'force');
    const { shapes } = drawGraph(graph, L, {
      vertex: (v) => (v === 'A' ? 'frontier' : v === 'B' ? 'done' : undefined),
      edge: (key) => (key === 'A-B' ? 'tree' : key === 'A-C' ? 'back' : 'unexamined'),
      parent: (key) => (key === 'A-B' ? 'A' : undefined),
      note: (v) => (v === 'A' ? 'd=0' : undefined),
      pointers: [{ name: 'u', at: 'A' }],
    });
    const byId = new Map(shapes.map((x) => [x.id, x]));
    expect(byId.get('vr-A')).toMatchObject({ kind: 'circle', cls: 'ghost' });
    expect(byId.get('vx-B')).toMatchObject({ role: 'done' });
    expect(byId.get('e-A-B')).toMatchObject({ head: 'end', role: 'done' });
    expect(byId.get('e-A-C')).toMatchObject({ dashed: true });
    expect(byId.get('ek-A-C')).toMatchObject({ text: 'B' });
    expect(byId.get('e-B-C')!.opacity).toBeLessThan(0.5);
    expect(byId.get('vn-A')).toMatchObject({ text: 'd=0' });
    expect(byId.get('ptr-u')).toMatchObject({ text: 'u' });
    expect(new Set(shapes.map((x) => x.id)).size).toBe(shapes.length);
  });

  it('draws rows, stacks and tables with stable ids', () => {
    const shapes: Shape[] = [];
    drawRow(shapes, { id: 'q', label: 'Q', cells: [{ key: 'B', text: 'B' }], x: 0, y: 0 });
    drawColumn(shapes, {
      id: 's',
      label: 'stack',
      cells: [
        { key: '1', text: 'A' },
        { key: '2', text: 'C' },
      ],
      x: 0,
      y: 0,
    });
    drawTable(shapes, {
      id: 't',
      x: 0,
      y: 0,
      columns: ['A', 'B'],
      head: 'v',
      rows: [{ key: 'd', label: 'd', cells: [{ text: '0' }, { text: '1' }] }],
    });
    const ids = shapes.map((x) => x.id);
    for (const id of ['q-B', 'q-B-t', 's-1', 's-2', 't-h-A', 't-d-B', 't-d-B-t'])
      expect(ids).toContain(id);
    // The top of the stack (the last cell) is drawn highest.
    const y = (id: string) => (shapes.find((x) => x.id === id) as { y: number }).y;
    expect(y('s-2')).toBeLessThan(y('s-1'));
  });

  it('puts panels where the smaller of a laptop and a phone picture is larger', () => {
    const graph = { x: 0, y: 0, w: 400, h: 260 };
    const block = (w: number, h: number) => (out: Shape[], x: number, y: number) => {
      out.push({ kind: 'rect', id: 'p', x, y, w, h });
      return { x, y, w, h };
    };
    const under: Shape[] = [];
    const a = placePanels(under, graph, block(380, 150));
    expect(a.y).toBeGreaterThan(graph.h);
    const side: Shape[] = [];
    const b = placePanels(side, { x: 0, y: 0, w: 160, h: 120 }, block(140, 330));
    expect(b.x).toBeGreaterThan(160);
    expect(fitScore({ x: 0, y: 0, w: 884, h: 305 })).toBeCloseTo(362 / 884);
  });
});
