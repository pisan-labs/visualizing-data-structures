import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { MAX_EDGES, MAX_VERTICES, letters, makeGraph, type Edge, type Graph } from './graph';
import {
  detectFormat,
  formatGraph,
  parseEdge,
  parseGraph,
  parseVertex,
  readGraph,
  type GraphFormat,
} from './parse';
import { randomGraph } from './presets';

const ok = (text: string): Graph => {
  const g = parseGraph(text);
  if (g instanceof Error) throw new Error(`${text}: ${g.message}`);
  return g;
};
const err = (text: string): string => {
  const g = parseGraph(text);
  if (!(g instanceof Error)) throw new Error(`${text} should not parse`);
  return g.message;
};
const pairs = (g: Graph) => g.edges.map((e) => `${e.u}${g.directed ? '>' : '-'}${e.v}:${e.w}`);

describe('edge lists', () => {
  it('reads undirected, directed and weighted edges and lone vertices', () => {
    const g = ok('A-B, B-C, C-A');
    expect(g.directed).toBe(false);
    expect(g.weighted).toBe(false);
    expect(g.vertices).toEqual(['A', 'B', 'C']);
    expect(pairs(g)).toEqual(['A-B:1', 'A-C:1', 'B-C:1']);

    const d = ok('A>B, B->C, C>A, D');
    expect(d.directed).toBe(true);
    expect(d.vertices).toEqual(['A', 'B', 'C', 'D']);
    expect(pairs(d)).toEqual(['A>B:1', 'B>C:1', 'C>A:1']);

    const w = ok('A-B:4, B-C, C-D:-3');
    expect(w.weighted).toBe(true);
    expect(pairs(w)).toEqual(['A-B:4', 'B-C:1', 'C-D:-3']);
  });

  it('accepts spaces, semicolons and spaces as separators', () => {
    expect(pairs(ok(' A - B : 2 ;B-C  C-D '))).toEqual(['A-B:2', 'B-C:1', 'C-D:1']);
    expect(ok('A B C').vertices).toEqual(['A', 'B', 'C']);
  });

  it('makes an undirected edge two arcs in a directed graph', () => {
    const g = ok('A-B, B>C');
    expect(g.directed).toBe(true);
    expect(pairs(g)).toEqual(['A>B:1', 'B>A:1', 'B>C:1']);
  });

  it('keeps names in natural order and stores u before v', () => {
    const g = ok('10-2, 2-1, v10-v2');
    expect(g.vertices).toEqual(['1', '2', '10', 'v2', 'v10']);
    expect(pairs(g)).toEqual(['1-2:1', '2-10:1', 'v2-v10:1']);
  });

  it('names the bad token in every error', () => {
    expect(err('')).toBe('Type a graph first, such as A-B, B-C, C-A.');
    expect(err(' , ;')).toBe('Type a graph first, such as A-B, B-C, C-A.');
    expect(err('A-B, ?C')).toBe(
      '"?C": "?" cannot start a vertex name. Write edges as A-B, A>B or A-B:4.',
    );
    expect(err('A-?')).toBe(
      '"A-?": "?" cannot start a vertex name. Write edges as A-B, A>B or A-B:4.',
    );
    expect(err('A-B, C-')).toBe('"C-" needs a vertex after "-". Write edges as A-B, A>B or A-B:4.');
    expect(err('A>')).toBe('"A>" needs a vertex after ">". Write edges as A-B, A>B or A-B:4.');
    expect(err('Alpha-B')).toBe(
      '"Alpha" is too long. Vertex names have 1 to 3 letters or digits, such as A or v10.',
    );
    expect(err('A-Bravo')).toBe(
      '"Bravo" is too long. Vertex names have 1 to 3 letters or digits, such as A or v10.',
    );
    expect(err('A-B, C:3')).toBe('"C:3": a weight goes on an edge, such as A-B:4.');
    expect(err('A-B:')).toBe('"A-B:" needs a weight after ":", such as A-B:4.');
    expect(err('A-B:4x')).toBe('"A-B:4x": Weights are whole numbers from -99 to 999.');
    expect(err('A-B:1000')).toBe('"A-B:1000": Weights are whole numbers from -99 to 999.');
    expect(err('A-B:4.5')).toBe('"A-B:4.5": Weights are whole numbers from -99 to 999.');
    expect(err('A<B')).toBe('"A<B": write an edge from B to A as B>A.');
    expect(err('A-B! C')).toBe(
      '"A-B! C": "!" cannot be part of a graph here. Write edges as A-B, A>B or A-B:4.',
    );
    expect(err('A-A')).toBe('"A-A" is a loop. An edge joins two different vertices.');
    expect(err('A-B, A-B')).toBe('"A-B" appears twice.');
    expect(err('A-B, B-A')).toBe('"B-A" repeats A-B.');
    expect(err('A>B, A>B')).toBe('"A>B" appears twice.');
    expect(err('A-B, A>B')).toBe('"A>B" repeats part of A-B, which already goes both ways.');
    expect(err('A>B, A-B')).toBe('"A>B" repeats part of A-B, which already goes both ways.');
    expect(err('A-B, C>D, B-A')).toBe('"B-A" repeats A-B.');
    const many = letters(17).join(', ');
    expect(err(many)).toBe('That is 17 vertices. Keep it to 16 so the drawing stays readable.');
    const names = letters(11);
    const dense: string[] = [];
    for (let i = 0; i < 11; i++)
      for (let j = i + 1; j < 11; j++) dense.push(`${names[i]}-${names[j]}`);
    expect(err(dense.join(', '))).toBe(
      `That is 55 edges. Keep it to ${MAX_EDGES} so the drawing stays readable.`,
    );
  });
});

describe('adjacency lists', () => {
  it('reads a symmetric list as undirected and any other as directed', () => {
    const u = ok('A: B C; B: A; C: A');
    expect(u.directed).toBe(false);
    expect(pairs(u)).toEqual(['A-B:1', 'A-C:1']);
    const d = ok('A: B C; B: C');
    expect(d.directed).toBe(true);
    expect(pairs(d)).toEqual(['A>B:1', 'A>C:1', 'B>C:1']);
  });

  it('reads weights, commas, empty lists and vertices that only appear as neighbours', () => {
    const g = ok('A: B:4, C:2; B: A:4; C: A:2; D:');
    expect(g.weighted).toBe(true);
    expect(g.directed).toBe(false);
    expect(g.vertices).toEqual(['A', 'B', 'C', 'D']);
    expect(pairs(g)).toEqual(['A-B:4', 'A-C:2']);
    expect(ok('A: E').vertices).toEqual(['A', 'E']);
    // Different weights each way make it directed.
    expect(ok('A: B:4; B: A:5').directed).toBe(true);
  });

  it('names the bad token in every error', () => {
    expect(err('A: B; B C')).toBe('"B C" needs a colon after its vertex, as in A: B C.');
    expect(err('A: B; : C')).toBe('": C" needs a vertex before the colon, as in A: B C.');
    expect(err('A: B; A B: C')).toBe(
      '"A B: C" should start with one vertex and a colon, as in A: B C.',
    );
    expect(err('Alpha: B')).toBe(
      '"Alpha" is too long. Vertex names have 1 to 3 letters or digits, such as A or v10.',
    );
    expect(err('A: B; A: C')).toBe(
      'A has two lists, "A: B" and "A: C". Give each vertex one list.',
    );
    expect(err('A: B?')).toBe(
      'In "A: B?", "B?" is not a vertex. List neighbours as B C, or B:4 C:2 with weights.',
    );
    expect(err('A: Bravo')).toBe(
      '"Bravo" is too long. Vertex names have 1 to 3 letters or digits, such as A or v10.',
    );
    expect(err('A: A')).toBe('"A: A" has a loop: A cannot be its own neighbour.');
    expect(err('A: B C B')).toBe('"A: B C B" lists B twice.');
    expect(err('A: B:')).toBe('"B:" needs a weight after ":", such as B:4.');
    expect(err('A: B:x')).toBe('"B:x": Weights are whole numbers from -99 to 999.');
  });
});

describe('matrices', () => {
  it('reads a symmetric matrix as undirected, others as directed, weights as weights', () => {
    const u = ok('0 1 1; 1 0 0; 1 0 0');
    expect(u.directed).toBe(false);
    expect(u.vertices).toEqual(['A', 'B', 'C']);
    expect(pairs(u)).toEqual(['A-B:1', 'A-C:1']);
    const d = ok('0 1; 0 0');
    expect(d.directed).toBe(true);
    expect(pairs(d)).toEqual(['A>B:1']);
    const w = ok('0,4;4,0');
    expect(w.weighted).toBe(true);
    expect(pairs(w)).toEqual(['A-B:4']);
    expect(ok('0 0; 0 0;').edges).toEqual([]);
  });

  it('names the bad entry or row in every error', () => {
    const big = Array.from({ length: 17 }, () => Array(17).fill(0).join(' ')).join('; ');
    expect(err(big)).toBe('That is 17 rows. Keep the matrix to 16 vertices so it stays readable.');
    expect(err('0 1; 1 x')).toBe(
      'Row 2 has "x". Matrix entries are whole numbers, and 0 means no edge.',
    );
    expect(err('0 1 1; 1 0; 1 0 0')).toBe(
      'Row 2 has 2 entries, but there are 3 rows. Each row needs one entry per vertex.',
    );
    expect(err('0 1;')).toBe(
      'Row 1 has 2 entries, but there is 1 row. Each row needs one entry per vertex.',
    );
    expect(err('0; 1 0')).toBe(
      'Row 1 has 1 entry, but there are 2 rows. Each row needs one entry per vertex.',
    );
    expect(err('1 0; 0 0')).toBe(
      'Row 1, column 1 is 1: A cannot have an edge to itself. Put 0 on the diagonal.',
    );
    expect(err('0 1000; 0 0')).toBe(
      '"row 1, column 2: 1000": Weights are whole numbers from -99 to 999.',
    );
  });
});

describe('format detection', () => {
  it('tells the three formats apart', () => {
    const cases: [string, GraphFormat][] = [
      ['A-B, B-C', 'edges'],
      ['1-2; 2-3', 'edges'],
      ['A', 'edges'],
      ['7', 'edges'],
      ['A: B C', 'adjacency'],
      ['10: 3', 'adjacency'],
      ['0 1; 1 0', 'matrix'],
      ['0 -2; -2 0', 'matrix'],
    ];
    for (const [text, f] of cases) expect(detectFormat(text), text).toBe(f);
    expect((readGraph('0 1; 1 0') as { format: GraphFormat }).format).toBe('matrix');
  });
});

describe('vertices and single edges', () => {
  it('reads one vertex name', () => {
    expect(parseVertex(' B ')).toBe('B');
    expect((parseVertex('') as Error).message).toBe('Type a vertex name, such as A.');
    expect((parseVertex('Alpha') as Error).message).toMatch(/is too long/);
    expect((parseVertex('A?') as Error).message).toBe(
      '"A?" is not a vertex name. Use 1 to 3 letters or digits, such as A or v10.',
    );
  });

  it('reads one edge', () => {
    expect(parseEdge('A-B')).toEqual({ u: 'A', v: 'B', directed: false, w: null });
    expect(parseEdge('B>A:7')).toEqual({ u: 'B', v: 'A', directed: true, w: 7 });
    expect(parseEdge('C->D')).toEqual({ u: 'C', v: 'D', directed: true, w: null });
    expect((parseEdge('') as Error).message).toBe('Type an edge, such as A-B or A>B.');
    expect((parseEdge('A') as Error).message).toBe(
      '"A" is not one edge. Type an edge such as A-B, A>B or A-B:4.',
    );
    expect((parseEdge('A-B, C-D') as Error).message).toMatch(/is not one edge/);
    expect((parseEdge('A-A') as Error).message).toBe(
      '"A-A" is a loop. An edge joins two different vertices.',
    );
    expect((parseEdge('A-') as Error).message).toMatch(/needs a vertex after/);
  });
});

describe('formatting', () => {
  it('writes edge lists, adjacency lists and matrices', () => {
    const g = ok('A-B:4, A-C:2, D');
    expect(formatGraph(g)).toBe('A-B:4, A-C:2, D');
    expect(formatGraph(g, 'adjacency')).toBe('A: B:4 C:2; B: A:4; C: A:2; D:');
    expect(formatGraph(g, 'matrix')).toBe('0 4 2 0; 4 0 0 0; 2 0 0 0; 0 0 0 0');
    const d = ok('A-B, B>C');
    expect(formatGraph(d)).toBe('A-B, B>C');
    // Every arc paired: written one way each, so it reads back directed.
    expect(formatGraph(ok('A>B, B>A'))).toBe('A>B, B>A');
  });

  const graphArb: fc.Arbitrary<Graph> = fc
    .record({
      n: fc.integer({ min: 1, max: MAX_VERTICES }),
      directed: fc.boolean(),
      weighted: fc.boolean(),
      pairs: fc.array(fc.tuple(fc.nat(15), fc.nat(15), fc.integer({ min: -99, max: 999 })), {
        maxLength: 40,
      }),
      numeric: fc.boolean(),
    })
    .map(({ n, directed, weighted, pairs: ps, numeric }) => {
      const names = numeric ? Array.from({ length: n }, (_, i) => String(i * 7)) : letters(n);
      const seen = new Set<string>();
      const edges: Edge[] = [];
      for (const [a, b, w] of ps) {
        const u = names[a % n]!;
        const v = names[b % n]!;
        const key = directed ? `${u}>${v}` : [u, v].sort().join('-');
        if (u === v || seen.has(key)) continue;
        seen.add(key);
        edges.push({ u, v, w });
      }
      return makeGraph({ directed, weighted, vertices: names, edges });
    });

  it('round-trips every graph with an edge through the edge list', () => {
    fc.assert(
      fc.property(graphArb, (g) => {
        const back = ok(formatGraph(g));
        if (g.edges.length === 0) {
          expect(back.vertices).toEqual(g.vertices);
          expect(back.edges).toEqual([]);
        } else {
          expect(back).toEqual(g);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('round-trips through the adjacency list and the matrix, within their limits', () => {
    fc.assert(
      fc.property(graphArb, (g) => {
        const w = new Map(g.edges.map((e) => [`${e.u}>${e.v}`, e.w]));
        const allPaired = g.directed && g.edges.every((e) => w.get(`${e.v}>${e.u}`) === e.w);
        const plain = g.edges.length > 0 && !allPaired;
        if (plain) expect(ok(formatGraph(g, 'adjacency'))).toEqual(g);
        const lettered = g.vertices.every((v, i) => v === letters(g.vertices.length)[i]);
        const noZero = g.edges.every((e) => e.w !== 0);
        const weightShows = !g.weighted || g.edges.some((e) => e.w !== 1);
        if (plain && lettered && noZero && weightShows && g.vertices.length > 1)
          expect(ok(formatGraph(g, 'matrix'))).toEqual(g);
      }),
      { numRuns: 400 },
    );
  });

  it('round-trips the random graphs the presets make', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = makeRng(seed);
      const g = randomGraph(rng, rng.int(2, 12), {
        density: rng.next(),
        directed: rng.int(0, 1) === 1,
        weighted: rng.int(0, 1) === 1,
      });
      expect(ok(formatGraph(g))).toEqual(g);
    }
  });
});
