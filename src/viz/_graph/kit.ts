/**
 * Helpers every graph page shares: the state shape, the starting graph, the input field, the
 * `load` operation and argument checks.
 *
 * Graph pages use the same operation names, so compare mode can put two of them side by side
 * on the same graph: `load` (graph text, the primary button) and `run` (with a start vertex
 * when the algorithm needs one). The shared input field takes graph text, and a vertex name or
 * a single edge is graph text too, so one field serves every button.
 *
 * API
 *   GraphState              { graph }: pages add their own fields
 *   START_GRAPH             the graph every graph page starts with (so compare mode matches)
 *   graphInput(sample)      the controls.input spec: label, placeholder, sample and a parse that
 *                           rejects text no format can read, naming the bad token
 *   loadOp({ ready })       the `load` operation: reads the text, says which format it was,
 *                           and keeps the old graph (and says why) when the text is bad
 *   vertexArg(g, arg)       a vertex of g, or a sentence saying what is wrong
 *   graphVars(g)            { V, E } for the variables panel
 */
import type { Controls, OpSpec, Scalar, Step, Value } from '../../engine/types';
import { hasVertex, listWords, makeGraph, summary, type Graph } from './graph';
import { FORMAT_NAMES, parseGraph, parseVertex, readGraph } from './parse';

export interface GraphState {
  graph: Graph;
}

/** Undirected, 8 vertices and 10 edges: breadth-first layers 0 to 3, and a deep DFS. */
export const START_TEXT = 'A-B, A-C, B-D, B-E, C-E, C-F, D-G, E-G, F-H, G-H';
export const START_GRAPH: Graph = parseGraph(START_TEXT) as Graph;

export const MAX_INPUT = 320;

/** Accepts any text one of the three formats can read; the error names the bad token. */
export function parseGraphInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a graph, such as A-B, B-C, or a vertex such as A.');
  const r = readGraph(t);
  return r instanceof Error ? r : t;
}

export function graphInput(sample = 'A-B, A-C, B-D, C-D, D-E'): NonNullable<Controls['input']> {
  return {
    label: 'Graph or vertex',
    placeholder: 'e.g. A-B, B-C:4, C>D or A',
    maxLength: MAX_INPUT,
    sample,
    parse: parseGraphInput,
  };
}

export const graphVars = (g: Graph): Record<string, Scalar> => ({
  V: g.vertices.length,
  E: g.edges.length,
});

/** A vertex of g from an operation argument, or a sentence saying what is wrong. */
export function vertexArg(g: Graph, arg: Value | undefined): { v: string } | { error: string } {
  const v = parseVertex(String(arg ?? ''));
  if (v instanceof Error) return { error: v.message };
  if (!hasVertex(g, v)) {
    const names =
      g.vertices.length <= 8 ? listWords(g.vertices) : `${g.vertices[0]} to ${g.vertices.at(-1)}`;
    return { error: `There is no vertex ${v}. This graph has ${names}.` };
  }
  return { v };
}

export interface LoadOptions<S extends GraphState> {
  /** The new state for a loaded graph (usually just { ...old, graph }). */
  make(graph: Graph, old: S): S;
  /** What to say after a good load, such as "Press Run to search from A." */
  ready(graph: Graph): string;
  vars?(s: S): Record<string, Scalar>;
}

/** The `load` operation every graph page has. */
export function loadOp<S extends GraphState, Set, X>(o: LoadOptions<S>): OpSpec<S, Set, X> {
  return {
    label: 'Load',
    arity: 1,
    *run(s, [arg]) {
      const r = readGraph(String(arg ?? ''));
      if (r instanceof Error) {
        yield {
          state: s,
          marks: [],
          say: `Nothing loaded. ${r.message} The graph stays as it was.`,
          lines: [],
          level: 1,
          vars: { ...graphVars(s.graph), ...o.vars?.(s) },
        } satisfies Step<S, X>;
        return s;
      }
      const g = r.graph;
      const next = o.make(g, s);
      const lone =
        g.vertices.length === 1 && g.edges.length === 0
          ? ` To start from a vertex instead, type its name and press Run.`
          : '';
      const s0 = summary(g);
      yield {
        state: next,
        marks: [],
        say: `Loaded ${s0}, read as ${FORMAT_NAMES[r.format]}. ${o.ready(g)}${lone}`,
        lines: [],
        level: 1,
        vars: { ...graphVars(g), ...o.vars?.(next) },
      } satisfies Step<S, X>;
      return next;
    },
  };
}

/** A copy of START_GRAPH, for a page's init. */
export const startGraph = (): Graph => makeGraph(START_GRAPH);
