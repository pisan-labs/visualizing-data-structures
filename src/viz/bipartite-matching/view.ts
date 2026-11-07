/**
 * Bipartite matching: the left side in a column on the left (or a row on top) and the right
 * side opposite, each in name order. Matched edges are double lines and their vertices green;
 * free vertices stay plain. The alternating path being built is blue. With Hopcroft-Karp, each
 * left vertex carries its layer in a badge during a phase. Beside or under the drawing: the
 * matching so far and, with Kuhn, the right vertices visited in the current search.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import {
  below,
  drawGraph,
  drawRow,
  edgeId,
  padBounds,
  placePanels,
  unionBounds,
  VERTEX_R,
  type GraphLayout,
  type Pt,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { edgeKey } from '../_graph/graph';
import {
  describe,
  describeRun,
  type BmExtra,
  type BmRun,
  type BmSettings,
  type BmState,
} from './model';

const GAP = 200;
const STEP = 58;

const cache = new WeakMap<BmState, Map<string, GraphLayout>>();

export function sidesLayout(s: BmState, how: BmSettings['layout']): GraphLayout {
  const hit = cache.get(s)?.get(how);
  if (hit) return hit;
  const pos: Record<string, Pt> = {};
  const n = Math.max(s.left.length, s.right.length);
  const place = (vs: string[], side: 0 | 1) =>
    vs.forEach((v, i) => {
      const along = (i + (n - vs.length) / 2) * STEP;
      pos[v] = how === 'rows' ? { x: along, y: side * GAP * 0.75 } : { x: side * GAP, y: along };
    });
  place(s.left, 0);
  place(s.right, 1);
  const pts = Object.values(pos);
  const r = VERTEX_R;
  const bounds: Bounds = pts.length
    ? {
        x: Math.min(...pts.map((p) => p.x)) - r,
        y: Math.min(...pts.map((p) => p.y)) - r,
        w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)) + 2 * r,
        h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)) + 2 * r,
      }
    : { x: 0, y: 0, w: 0, h: 0 };
  const layout = { pos, r, bounds };
  const byHow = cache.get(s) ?? new Map<string, GraphLayout>();
  byHow.set(how, layout);
  cache.set(s, byHow);
  return layout;
}

function look(r: BmRun, v: string): VertexLook | undefined {
  if (v === r.u && !r.done) return 'current';
  if (r.mate[v]) return 'done';
  if (r.visited.includes(v)) return 'visited';
  return undefined;
}

/** The edges of a path, by key. */
const pathKeys = (s: BmState, p: string[]) => p.slice(1).map((v, i) => edgeKey(s.graph, p[i]!, v));

export function view(step: Step<BmState, BmExtra>, settings: BmSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const g = state.graph;
  const r = extra.run;
  const roles = new Map<string, MarkRole>();
  const matched = new Set<string>();
  if (r) for (const u of state.left) if (r.mate[u]) matched.add(edgeKey(g, u, r.mate[u]!));
  const onPath = new Set(r ? pathKeys(state, r.path) : []);
  for (const k of onPath) roles.set(edgeId(k), 'active');
  for (const m of step.marks) roles.set(m.id, m.role);
  const layout = sidesLayout(state, settings.layout);
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: r && ((v) => look(r, v)),
    // At the end only the matching stays bold; the other edges fade.
    edge: r && ((key) => (r.done && !matched.has(key) ? 'unexamined' : undefined)),
    note:
      r?.dist &&
      ((v) => (v in r.dist! ? (r.dist![v] === null ? 'd=∞' : `d=${r.dist![v]}`) : undefined)),
    pointers: r?.u && !r.done ? [{ name: 'u', at: r.u, role: 'active' }] : [],
  });
  const shapes: Shape[] = [];
  // A matched edge is a double line: the edge itself and a twin beside it.
  for (const sh of drawn.shapes) {
    shapes.push(sh);
    if (sh.kind !== 'arrow' || !sh.id.startsWith('e-')) continue;
    const key = sh.id.replace(/^e-/, '').replace(/-a$/, '');
    if (!matched.has(key)) continue;
    const len = Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1) || 1;
    const nx = (-(sh.y2 - sh.y1) / len) * 4;
    const ny = ((sh.x2 - sh.x1) / len) * 4;
    shapes.push({
      ...sh,
      id: `${sh.id}-m`,
      x1: sh.x1 + nx,
      y1: sh.y1 + ny,
      x2: sh.x2 + nx,
      y2: sh.y2 + ny,
    });
  }
  const boxes: Bounds[] = [drawn.bounds];
  if (r) {
    boxes.push(
      placePanels(shapes, drawn.bounds, stage, (out, x, y) => {
        const pairs = state.left.filter((u) => r.mate[u]);
        const row = drawRow(out, {
          id: 'm',
          label: 'matched',
          labelW: 76,
          cells: pairs.map((u) => ({
            key: u,
            text: `${u}–${r.mate[u]}`,
            role: r.last?.includes(u) ? ('new' as const) : r.done ? ('done' as const) : undefined,
          })),
          x,
          y,
          roles,
          perRow: 4,
          cellW: 58,
          empty: 'nothing yet',
        });
        const parts: Bounds[] = [row];
        if (settings.method !== 'hopcroft-karp') {
          const seen = drawRow(out, {
            id: 'vis',
            label: 'visited',
            labelW: 76,
            cells: r.visited.map((v) => ({ key: v, text: v })),
            x,
            y: below(row, 10),
            roles,
            perRow: 8,
            empty: r.done ? 'search over' : 'none',
          });
          parts.push(seen);
        }
        // Room for every pair, so the drawing keeps its size as the matching grows.
        const most = Math.min(state.left.length, state.right.length);
        parts.push({
          x,
          y,
          w: 76 + Math.min(4, Math.max(1, most)) * 62,
          h: Math.ceil(Math.max(1, most) / 4) * 34 + 36,
        });
        return unionBounds(...parts);
      }),
    );
  }
  const label = r ? `${describe(state)} ${describeRun(state, r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
