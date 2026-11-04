/**
 * The graph, and the same graph stored three ways. The adjacency list and the matrix have a
 * row per vertex in name order, so they sit side by side and their rows line up.
 *
 * - 'wide' (the default): three columns, the drawing with the edge list under it, then the
 *   list, then the matrix. About as wide as it is tall: it reads on a laptop, and on a phone
 *   too, a little small.
 * - 'tall': the drawing on top, the list and matrix under it, then the edge list. For a phone in
 *   portrait, where height is cheap and width is not.
 *
 * A plain state (no step data) draws the same thing unmarked.
 */
import type { MarkRole, Step } from '../../engine/types';
import {
  below,
  beside,
  drawAdjList,
  drawAdjMatrix,
  drawEdgeList,
  drawGraph,
  layoutGraph,
  padBounds,
  scaleLayout,
  unionBounds,
} from '../../layouts/graph';
import type { Scene, Shape } from '../../render/scene';
import { describe, type RepExtra, type RepSettings, type RepState } from './model';

/** Width of one edge-list column, cell plus gap (see drawEdgeList). */
const EDGE_COL = 58;

export function view(step: Step<RepState, RepExtra>, settings: RepSettings): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  // The drawing is the smallest part here: the representations are the point.
  const layout = scaleLayout(layoutGraph(g, settings.layout), 0.82);
  const drawn = drawGraph(g, layout, {
    roles,
    fade: (v) => (v === extra.leaving ? 0.45 : undefined),
  });
  const shapes: Shape[] = [...drawn.shapes];
  const gb = drawn.bounds;
  const E = g.edges.length;
  let all;
  if (settings.arrange === 'tall') {
    const list = drawAdjList(shapes, g, {
      id: 'al',
      x: gb.x,
      y: below(gb, 22),
      roles,
      title: 'adjacency list',
    });
    const matrix = drawAdjMatrix(shapes, g, {
      id: 'am',
      x: beside(list, 28),
      y: list.y,
      roles,
      title: 'adjacency matrix',
    });
    const room = Math.max(gb.w, matrix.x + matrix.w - gb.x);
    const cols = Math.max(1, Math.floor((room + 10) / EDGE_COL));
    const edges = drawEdgeList(shapes, g, {
      id: 'el',
      x: gb.x,
      y: below(unionBounds(list, matrix), 22),
      roles,
      title: 'edge list',
      perCol: Math.max(2, Math.ceil(E / cols)),
    });
    all = unionBounds(gb, list, matrix, edges);
  } else {
    // Edge rows per column: about as many as the lists have rows, so the columns end together.
    const perCol = Math.max(4, Math.min(g.vertices.length, Math.ceil(E / 2)));
    const edges = drawEdgeList(shapes, g, {
      id: 'el',
      x: gb.x,
      y: below(gb, 22),
      roles,
      title: 'edge list',
      perCol,
    });
    const col1 = unionBounds(gb, edges);
    const list = drawAdjList(shapes, g, {
      id: 'al',
      x: beside(col1, 30),
      y: gb.y,
      roles,
      title: 'adjacency list',
    });
    const matrix = drawAdjMatrix(shapes, g, {
      id: 'am',
      x: beside(list, 28),
      y: gb.y,
      roles,
      title: 'adjacency matrix',
    });
    all = unionBounds(col1, list, matrix);
  }
  return { shapes, bounds: padBounds(all, 12), label: describe(state) };
}
