/**
 * Monte Carlo tree search: the whole tree of next words, drawn from the start so the camera stays
 * still. A node in the search tree is solid and shows its visits n and mean reward Q ("3 · .6");
 * a node not yet added is dashed. Each finished sentence (a leaf) has the reward model's score
 * beside it. During selection, the children compared show their UCB1 score; the rollout's path
 * is dashed and marked.
 *
 * A laptop draws the tree top down, the twelve sentences along the bottom; a phone draws it
 * sideways, the sentences down the right.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { short, two } from '../_lm/numbers';
import {
  describe,
  edgeId,
  inTree,
  isLeaf,
  meanOf,
  nodeId,
  ROOT,
  TREE,
  type MctsExtra,
  type MctsSettings,
  type MctsState,
} from './model';

const BOX_W = 72;
const ROOT_W = 92;
const BOX_H = 52;
/** Top down: the room per sentence along the bottom, and between levels. */
const SLOT = 74;
const LEVEL = 92;
/** Sideways: the left edge of each depth's column, and the room per sentence. */
const COLS = [0, 104, 190, 276];
const ROW = 56;
const TOKEN = 15;
const SMALL = 13;

const widthOf = (id: number) => (id === ROOT ? ROOT_W : BOX_W);

/** The leaves in order, left to right. */
const LEAVES = TREE.filter((t) => isLeaf(t.id)).map((t) => t.id);

/** Each node's position along the spread (leaves 0, 1, 2...; a parent at the middle of its children). */
const SPREAD: number[] = (() => {
  const at = TREE.map(() => 0);
  const place = (id: number): number => {
    const kids = TREE[id]!.children;
    if (!kids.length) return (at[id] = LEAVES.indexOf(id));
    const ps = kids.map(place);
    return (at[id] = (ps[0]! + ps.at(-1)!) / 2);
  };
  place(ROOT);
  return at;
})();

/** Top left corner of each node's box. */
function boxes(sideways: boolean): Bounds[] {
  return TREE.map((t) => {
    const w = widthOf(t.id);
    return sideways
      ? { x: COLS[t.depth]!, y: SPREAD[t.id]! * ROW, w, h: BOX_H }
      : { x: SPREAD[t.id]! * SLOT + BOX_W / 2 - w / 2, y: t.depth * LEVEL, w, h: BOX_H };
  });
}

function drawTree(
  state: MctsState,
  extra: MctsExtra,
  roles: ReadonlyMap<string, MarkRole>,
  sideways: boolean,
): { shapes: Shape[]; bounds: Bounds } {
  const at = boxes(sideways);
  const trace = extra.trace;
  const added = extra.phase && extra.phase !== 'select' ? trace?.added : undefined;
  const live = (id: number) => inTree(state, id) || id === added;
  // UCB1 scores to show: those of the selection steps so far.
  const ucbs = new Map<number, number>();
  if (extra.phase === 'select' && trace)
    for (const sc of trace.scores.slice(0, extra.scored ?? 0))
      for (const [id, u] of sc.ucb) ucbs.set(id, u);
  const shapes: Shape[] = [];
  const marks: Bounds[] = [];
  for (const t of TREE) {
    const b = at[t.id]!;
    const on = live(t.id);
    const role = roles.get(nodeId(t.id));
    if (t.parent !== null) {
      const p = at[t.parent]!;
      const eRole = roles.get(edgeId(t.id));
      shapes.push({
        kind: 'arrow',
        id: edgeId(t.id),
        ...(sideways
          ? { x1: p.x + p.w, y1: p.y + BOX_H / 2, x2: b.x, y2: b.y + BOX_H / 2 }
          : { x1: p.x + p.w / 2, y1: p.y + BOX_H, x2: b.x + b.w / 2, y2: b.y }),
        head: 'none',
        dashed: !on || eRole === 'visit',
        role: eRole,
      });
    }
    shapes.push({
      kind: 'rect',
      id: nodeId(t.id),
      ...b,
      r: 4,
      cls: on ? 'live' : 'ghost',
      role,
    });
    const cx = b.x + b.w / 2;
    shapes.push({
      kind: 'text',
      id: `${nodeId(t.id)}-t`,
      x: cx,
      y: b.y + 17,
      text: t.token,
      size: TOKEN,
      weight: 'bold',
      anchor: 'middle',
      mono: true,
      cls: on || role ? undefined : 'label',
    });
    const n = state.n[t.id]!;
    if (on)
      shapes.push({
        kind: 'text',
        id: `${nodeId(t.id)}-s`,
        x: cx,
        y: b.y + 33,
        text: n > 0 ? `${n} · ${short(meanOf(state, t.id))}` : '0 · –',
        size: SMALL,
        anchor: 'middle',
        mono: true,
      });
    const u = ucbs.get(t.id);
    if (u !== undefined)
      shapes.push({
        kind: 'text',
        id: `${nodeId(t.id)}-u`,
        x: cx,
        y: b.y + 47,
        text: `UCB ${two(u)}`,
        size: SMALL,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role: role === 'active' ? 'active' : undefined,
      });
    if (t.reward !== undefined) {
      const rRole = roles.get(`r-${t.id}`);
      const label = sideways
        ? { x: b.x + b.w + 6, y: b.y + BOX_H / 2 + 5, anchor: 'start' as const }
        : { x: cx, y: b.y + BOX_H + 16, anchor: 'middle' as const };
      shapes.push({
        kind: 'text',
        id: `r-${t.id}`,
        ...label,
        text: `r ${short(t.reward)}`,
        size: SMALL,
        mono: true,
        cls: rRole ? undefined : 'label',
        role: rRole,
        weight: rRole ? 'bold' : 'normal',
      });
      marks.push(
        sideways
          ? { x: label.x, y: b.y, w: 34, h: BOX_H }
          : { x: cx - 20, y: b.y + BOX_H, w: 40, h: 20 },
      );
    }
  }
  return { shapes, bounds: padBounds(unionBounds(...at, ...marks), 12) };
}

export function view(
  step: Step<MctsState, MctsExtra>,
  _settings: MctsSettings,
  stage?: StageSize,
): Scene {
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const extra = step.extra ?? {};
  const best = pickLayout(stage, [
    drawTree(step.state, extra, roles, false),
    drawTree(step.state, extra, roles, true),
  ]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(step.state) };
}
