import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { parseEdge } from '../_graph/parse';
import { graphPresets, loadCall, randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/representations.hpp?raw';
import javaSource from './code/java/Representations.java?raw';
import pythonSource from './code/python/representations.py?raw';
import addVertexCopy from './examples/add-vertex-copy.json';
import dense from './examples/dense.json';
import directedArcs from './examples/directed-arcs.json';
import disconnected from './examples/disconnected.json';
import edgeListWorst from './examples/edge-list-worst.json';
import listWorst from './examples/list-worst.json';
import neighboursRow from './examples/neighbours-row.json';
import removeVertex from './examples/remove-vertex.json';
import sparse from './examples/sparse.json';
import weighted from './examples/weighted.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type RepExtra,
  type RepSettings,
  type RepState,
} from './model';
import { repPractice } from './practice';
import { view } from './view';

export const graphRepresentations: VizDef<RepState, RepSettings, RepExtra> = {
  id: 'graph-representations',
  title: 'Graph representations',
  family: 'Graphs',
  blurb:
    'The same graph as an adjacency list, an adjacency matrix and an edge list, with the cost of each operation counted in all three.',
  settings: [
    layoutSetting(),
    {
      kind: 'choice',
      key: 'arrange',
      label: 'Arrange',
      options: [
        { value: 'wide', label: 'Side by side: for a laptop or a projector' },
        { value: 'tall', label: 'Stacked: for a phone held upright' },
      ],
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: graphInput('A-B'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'hasEdge', label: 'Has edge?', usesInput: true },
      { op: 'addEdge', label: 'Add edge', usesInput: true },
      { op: 'removeEdge', label: 'Remove edge', usesInput: true },
      { op: 'neighbours', label: 'Neighbours of', usesInput: true, more: true },
      { op: 'addVertex', label: 'Add vertex', usesInput: true, more: true },
      { op: 'removeVertex', label: 'Remove vertex', usesInput: true, more: true },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(randomGraph(rng, rng.int(5, 8), { density: 0.25 }))],
    },
    presets: graphPresets(),
    sizes: [4, 6, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'hasEdge(u, v): adjacency list',
      best: {
        cost: 'O(1)',
        why: 'v is the first entry of Adj[u].',
        example: 'sparse',
      },
      average: {
        cost: 'O(1 + E/V)',
        why: 'A list is as long as its vertex’s degree, which is 2E/V on average.',
        example: 'neighbours-row',
      },
      worst: {
        cost: 'O(V)',
        why: 'u is joined to every other vertex and v comes last, or is missing.',
        example: 'list-worst',
      },
    },
    {
      op: 'hasEdge(u, v): adjacency matrix',
      best: { cost: 'O(1)', why: 'Read M[u][v]: one cell.', example: 'sparse' },
      average: { cost: 'O(1)', why: 'The same one cell, whatever the graph.' },
      worst: { cost: 'O(1)', why: 'Still one cell, even in a dense graph.', example: 'dense' },
    },
    {
      op: 'hasEdge(u, v): edge list',
      best: { cost: 'O(1)', why: 'The edge is in the first row.' },
      average: { cost: 'O(E)', why: 'On average the scan reads half the rows.', example: 'sparse' },
      worst: {
        cost: 'O(E)',
        why: 'The edge is not there, so every row is read.',
        example: 'edge-list-worst',
      },
    },
    {
      op: 'neighbours(u): adjacency list',
      best: { cost: 'O(1)', why: 'u has no edges: an empty list.', example: 'disconnected' },
      average: {
        cost: 'O(1 + E/V)',
        why: 'Read Adj[u], the average degree.',
        example: 'neighbours-row',
      },
      worst: { cost: 'O(V)', why: 'u is joined to every other vertex.', example: 'dense' },
    },
    {
      op: 'neighbours(u): adjacency matrix',
      best: {
        cost: 'O(V)',
        why: 'The whole row is read even when it is all zeros.',
        example: 'disconnected',
      },
      average: { cost: 'O(V)', why: 'Always one full row of V cells.', example: 'neighbours-row' },
      worst: { cost: 'O(V)', why: 'One full row of V cells.' },
      note: 'So a search that visits every vertex costs O(V + E) with lists but O(V²) with a matrix.',
    },
    {
      op: 'addVertex(x): adjacency matrix',
      best: {
        cost: 'O(V²)',
        why: 'There is no room for a new row and column: copy all V² cells.',
        example: 'add-vertex-copy',
      },
      average: { cost: 'O(V²)', why: 'Every add copies the matrix.' },
      worst: { cost: 'O(V²)', why: 'Every add copies the matrix.' },
      note: 'With spare room kept for later (like a dynamic array), it costs O(V) amortized. A list adds an empty list in O(1).',
    },
    {
      op: 'removeVertex(x): adjacency list',
      best: {
        cost: 'O(V + E)',
        why: 'Every list has to be searched for x.',
        example: 'remove-vertex',
      },
      average: { cost: 'O(V + E)', why: 'All the lists together hold E (or 2E) entries.' },
      worst: { cost: 'O(V + E)', why: 'All the lists together hold E (or 2E) entries.' },
      note: 'The matrix copies into a smaller one in O(V²). The edge list reads all E rows.',
    },
    {
      op: 'Space for the whole graph',
      best: {
        cost: 'Θ(V + E) list, Θ(V²) matrix',
        why: 'A list stores one entry per edge end; the matrix one cell per pair.',
        example: 'sparse',
      },
      average: {
        cost: 'Θ(V + E) list, Θ(V²) matrix',
        why: 'The matrix size never depends on how many edges there are.',
      },
      worst: {
        cost: 'Θ(V²) both',
        why: 'A complete graph has E = V(V-1)/2 edges, so the lists are as big as the matrix.',
        example: 'dense',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RepSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    sparse,
    listWorst,
    edgeListWorst,
    neighboursRow,
    dense,
    directedArcs,
    disconnected,
    weighted,
    addVertexCopy,
    removeVertex,
  ] as unknown as SavedExample[],
  practice: repPractice(() => graphRepresentations),
  preview: { example: 'dense', level: 3 },
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * classes number the names 0..n-1 in that order) and "edge u v" adds an edge; neither prints.
 * Each query prints the adjacency list's answer, then the matrix's:
 *   has u v -> yes|no twice; add u v -> added|exists twice; remove u v -> removed|missing twice;
 *   neighbours u -> "B C / B C" ("none" for no neighbours).
 * Vertex changes rebuild the graph with a new "graph" line. Calls the model refuses are left out.
 */
function codeScript(calls: OpCall[], settings: RepSettings) {
  const t = new Timeline(graphRepresentations, settings, 1, calls);
  const input: string[] = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const [op, arg] = e.call;
    const last = e.steps.at(-1)!;
    const after = e.end.graph;
    const edge = parseEdge(String(arg ?? ''));
    const ends = edge instanceof Error ? null : `${edge.u} ${edge.v}`;
    if (op === 'load' || op === 'addVertex' || op === 'removeVertex') {
      if (after !== before) input.push(...graphLines(after));
    } else if (op === 'hasEdge' && last.vars?.answer !== undefined && ends) {
      input.push(`has ${ends}`);
      expected.push(last.vars.answer === 'yes' ? 'yes yes' : 'no no');
    } else if (op === 'neighbours' && last.vars?.answer !== undefined) {
      input.push(`neighbours ${String(arg).trim()}`);
      expected.push(`${last.vars.answer} / ${last.vars.answer}`);
    } else if (op === 'addEdge' && ends) {
      if (after !== before) {
        input.push(`add ${ends}`);
        expected.push('added added');
      } else if (last.lines.includes('add.exists')) {
        input.push(`add ${ends}`);
        expected.push('exists exists');
      }
    } else if (op === 'removeEdge' && ends) {
      if (after !== before) {
        input.push(`remove ${ends}`);
        expected.push('removed removed');
      } else if (last.lines.includes('rem.missing')) {
        input.push(`remove ${ends}`);
        expected.push('missing missing');
      }
    }
    before = after;
  }
  return { input, expected };
}

export default graphRepresentations;
