/**
 * Beam search: the tree of hypotheses. Each node is a word with the log-probability of the
 * whole hypothesis up to it; the edge into it carries P(word | the word before). The beam is
 * blue, what was just made is green, dropped candidates have a dashed outline, finished ones
 * (ending with </s>) a green outline, and the answer is marked found, with its path. A list of
 * the finished hypotheses sits beside the tree.
 *
 * A laptop draws the tree sideways, one column per step; a phone draws it as an indented
 * outline, one row per node. Both are laid out from the whole search, so the camera stays still.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_PAD } from '../_decode/bars';
import { short, two } from '../_lm/numbers';
import {
  describe,
  finalScore,
  hypText,
  nodeId,
  type BeamExtra,
  type BeamSettings,
  type BeamState,
  type Search,
  type Status,
} from './model';

const NODE_W = 70;
const NODE_H = 42;
const COL = 100;
const ROW = 50;
const OUT_W = 160;
const OUT_ROW = 27;
const INDENT = 22;

interface Block {
  shapes: Shape[];
  bounds: Bounds;
}

interface Look {
  role?: MarkRole;
  cls: string;
  dim: boolean;
}

function look(st: Status, mark: MarkRole | undefined): Look {
  const base: Record<Status, Look> = {
    root: { cls: 'live', dim: false },
    new: { role: 'new', cls: 'live', dim: false },
    live: { role: 'active', cls: 'live', dim: false },
    expanded: { cls: 'live', dim: false },
    pruned: { cls: 'ghost', dim: true },
    finished: { role: 'done', cls: 'live', dim: false },
    cut: { role: 'compare', cls: 'live', dim: false },
  };
  const b = base[st];
  return mark ? { ...b, role: mark, dim: false, cls: 'live' } : b;
}

/** Children of each node, in the order they were made. */
function childrenOf(sr: Search, shown: number): number[][] {
  const kids: number[][] = sr.nodes.map(() => []);
  for (const h of sr.nodes.slice(1, shown)) kids[h.parent!]!.push(h.id);
  return kids;
}

/** Sideways: column = step, each column's nodes in their parents' order, near their parents. */
function columns(sr: Search): Map<number, { x: number; y: number }> {
  const all = childrenOf(sr, sr.nodes.length);
  const pos = new Map<number, { x: number; y: number }>();
  let col = [0];
  pos.set(0, { x: 0, y: 0 });
  for (let d = 1; col.length; d++) {
    const next = col.flatMap((p) => all[p]!);
    if (!next.length) break;
    const ys = col.filter((p) => all[p]!.length).map((p) => pos.get(p)!.y);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const top = mid - ((next.length - 1) * ROW) / 2;
    next.forEach((id, k) => pos.set(id, { x: d * COL, y: top + k * ROW }));
    col = next;
  }
  // Shift so the top node sits at y = 0.
  const minY = Math.min(...[...pos.values()].map((q) => q.y));
  for (const q of pos.values()) q.y -= minY;
  return pos;
}

/** Outline: one row per node in preorder, indented by depth. */
function outline(sr: Search): Map<number, { x: number; y: number }> {
  const all = childrenOf(sr, sr.nodes.length);
  const pos = new Map<number, { x: number; y: number }>();
  let row = 0;
  const walk = (id: number) => {
    pos.set(id, { x: sr.nodes[id]!.depth * INDENT, y: row++ * OUT_ROW });
    for (const c of all[id]!) walk(c);
  };
  walk(0);
  return pos;
}

function finishedList(
  sr: Search,
  finished: readonly number[],
  roles: ReadonlyMap<string, MarkRole>,
  x: number,
  y: number,
  reserve: number,
): Block {
  const shapes: Shape[] = [
    {
      kind: 'text',
      id: 'f-title',
      x,
      y: y + 15,
      text: sr.norm ? 'finished (score ÷ length)' : 'finished (score)',
      size: 15,
      weight: 'bold',
      mono: true,
    },
  ];
  let w = 0;
  finished.forEach((f, k) => {
    const h = sr.nodes[f]!;
    const t = `${hypText(sr, f)}  ${two(h.score)}${sr.norm ? ` ÷ ${h.len} = ${two(finalScore(h, true))}` : ''}`;
    w = Math.max(w, t.length * 9);
    const role = roles.get(nodeId(f));
    shapes.push({
      kind: 'text',
      id: `f-${f}`,
      x,
      y: y + 42 + k * 26,
      text: t,
      size: 15,
      mono: true,
      role: role === 'found' ? 'found' : undefined,
      weight: role === 'found' ? 'bold' : 'normal',
    });
  });
  return { shapes, bounds: { x, y, w: Math.max(w, 230), h: 42 + Math.max(reserve, 1) * 26 } };
}

function drawTree(
  sr: Search,
  shown: number,
  status: readonly Status[],
  roles: ReadonlyMap<string, MarkRole>,
  sideways: boolean,
  y0: number,
): Block {
  const pos = sideways ? columns(sr) : outline(sr);
  const shapes: Shape[] = [];
  // The answer's path, once there is one.
  const onPath = new Set<number>();
  if (roles.get(nodeId(sr.best ?? -1)) === 'found')
    for (let h = sr.best; h !== null; h = sr.nodes[h]!.parent) onPath.add(h);
  const boxes: Bounds[] = [];
  for (const h of sr.nodes) {
    const q = pos.get(h.id)!;
    const x = q.x;
    const y = q.y + y0;
    const w = sideways ? NODE_W : OUT_W;
    const hh = sideways ? NODE_H : OUT_ROW - 4;
    boxes.push({ x, y, w, h: hh });
    if (h.id >= shown) continue;
    const st = status[h.id]!;
    const lk = look(st, roles.get(nodeId(h.id)) ?? (onPath.has(h.id) ? 'found' : undefined));
    const id = nodeId(h.id);
    if (h.parent !== null) {
      const p = pos.get(h.parent)!;
      const edgeRole = onPath.has(h.id) ? 'found' : undefined;
      if (sideways) {
        shapes.push({
          kind: 'arrow',
          id: `e-${h.id}`,
          x1: p.x + NODE_W,
          y1: p.y + y0 + NODE_H / 2,
          x2: x,
          y2: y + NODE_H / 2,
          head: 'none',
          dashed: lk.dim,
          role: edgeRole,
        });
        shapes.push({
          kind: 'text',
          id: `e-${h.id}-p`,
          x: x - 3,
          y: y + NODE_H / 2 - 6,
          text: short(h.p),
          size: 14,
          anchor: 'end',
          mono: true,
          cls: 'label',
        });
      } else {
        const ex = p.x + 10;
        shapes.push({
          kind: 'arrow',
          id: `e-${h.id}`,
          x1: ex,
          y1: p.y + y0 + OUT_ROW - 4,
          x2: ex,
          y2: y + (OUT_ROW - 4) / 2,
          head: 'none',
          dashed: lk.dim,
          role: edgeRole,
        });
        shapes.push({
          kind: 'arrow',
          id: `e-${h.id}-h`,
          x1: ex,
          y1: y + (OUT_ROW - 4) / 2,
          x2: x,
          y2: y + (OUT_ROW - 4) / 2,
          head: 'none',
          dashed: lk.dim,
          role: edgeRole,
        });
      }
    }
    shapes.push({ kind: 'rect', id, x, y, w, h: hh, r: 4, cls: lk.cls, role: lk.role });
    const tokenText = {
      kind: 'text' as const,
      id: `${id}-t`,
      text: h.token,
      size: 15,
      weight: 'bold' as const,
      mono: true,
      cls: lk.dim ? 'label' : undefined,
      role: lk.dim ? undefined : lk.role === 'found' ? ('found' as const) : undefined,
    };
    const scoreText = {
      kind: 'text' as const,
      id: `${id}-s`,
      text: two(h.score),
      size: 14,
      mono: true,
      cls: lk.dim ? 'label' : undefined,
    };
    if (sideways) {
      shapes.push({ ...tokenText, x: x + w / 2, y: y + 17, anchor: 'middle' });
      shapes.push({ ...scoreText, x: x + w / 2, y: y + 35, anchor: 'middle' });
    } else {
      shapes.push({ ...tokenText, x: x + 8, y: y + 17 });
      if (h.parent !== null)
        shapes.push({
          kind: 'text',
          id: `${id}-p`,
          x: x + 92,
          y: y + 17,
          text: short(h.p),
          size: 14,
          anchor: 'end',
          mono: true,
          cls: 'label',
        });
      shapes.push({ ...scoreText, x: x + w - 6, y: y + 17, anchor: 'end' });
    }
  }
  return { shapes, bounds: unionBounds(...boxes) };
}

export function view(
  step: Step<BeamState, BeamExtra>,
  _settings: BeamSettings,
  stage?: StageSize,
): Scene {
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const work = step.extra?.work;
  const sr = work?.search ?? step.state.search;
  const label = describe(step.state);
  if (!sr) {
    const shapes: Shape[] = [
      {
        kind: 'text',
        id: 'empty',
        x: 0,
        y: 20,
        text: 'Press Beam search or Greedy.',
        size: 15,
        mono: true,
        cls: 'label',
      },
    ];
    return { shapes, bounds: padBounds({ x: 0, y: 0, w: 300, h: 30 }, 12), label };
  }
  const shown = work ? work.shown : sr.nodes.length;
  const status = work ? work.status : sr.status;
  const finished = work ? work.finished : sr.finished;
  const reserve = sr.finished.length;
  const top = stage?.strip ? 0 : ZOOM_PAD;

  const arrange = (sideways: boolean): Block => {
    const tree = drawTree(sr, shown, status, roles, sideways, 0);
    const list = sideways
      ? finishedList(sr, finished, roles, tree.bounds.x + tree.bounds.w + 36, top, reserve)
      : finishedList(sr, finished, roles, 0, tree.bounds.y + tree.bounds.h + 24, reserve);
    return {
      shapes: [...tree.shapes, ...list.shapes],
      bounds: padBounds(unionBounds(tree.bounds, list.bounds, { x: 0, y: 0, w: 1, h: 1 }), 14),
    };
  };
  const best = pickLayout(stage, [arrange(true), arrange(false)]);
  return { shapes: best.shapes, bounds: best.bounds, label };
}
