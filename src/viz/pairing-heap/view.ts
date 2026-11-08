import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { labelSize, padBounds, unionBounds } from '../../layouts/binary-tree';
import { drawForest, layoutForest } from '../../layouts/forest';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_BUTTONS } from '../../render/stage';
import { count, describe, type PairExtra, type PairSettings, type PairState } from './model';

const R = 17;
const BOX_W = 56;

/**
 * The trees side by side, or (on a narrow stage, when there are several) wrapped onto rows: the
 * arrangement drawn largest wins.
 */
export function view(
  step: Step<PairState, PairExtra>,
  settings: PairSettings,
  stage?: StageSize,
): Scene {
  // On a laptop the zoom buttons cover the top right corner, where a second tree (a new key, H2,
  // a cut subtree) stands level with the root: keep a band clear above the roots.
  const head = stage && !stage.strip ? ZOOM_BUTTONS.size + 12 : 0;
  const one = draw(step, settings, Infinity, head);
  if (!stage || step.state.roots.length < 2) return one;
  return pickLayout(stage, [one, draw(step, settings, 420, head), draw(step, settings, 280, head)]);
}

function draw(
  step: Step<PairState, PairExtra>,
  settings: PairSettings,
  maxWidth: number,
  head = 0,
): Scene {
  const { state: s, extra } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const pointers = settings.draw === 'pointers';
  const kids = (u: number) => s.nodes[u]?.kids ?? [];
  const layout = layoutForest(s.roots, kids, {
    radius: R,
    gap: pointers ? 22 : 8,
    treeGap: pointers ? 34 : 30,
    levelGap: pointers ? 60 : 54,
    maxWidth,
    rowGap: 46,
  });
  const shapes: Shape[] = drawForest(layout, {
    label: (u) => String(s.nodes[u]!.key),
    children: kids,
    roles,
    style: pointers ? 'pointers' : 'tree',
  });
  const boxes: Bounds[] = [];
  if (s.roots.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 44,
      y: 5,
      text: 'empty heap',
      size: 15,
      anchor: 'middle',
      cls: 'label',
      role: roles.get('empty'),
    });
    boxes.push({ x: 0, y: -R, w: 88, h: 2 * R });
  } else boxes.push(layout.bounds);
  if (head) boxes.push({ x: 0, y: -R - head, w: 1, h: head });

  // Labels over roots: "H2" for the heap waiting to be melded.
  for (const [u, text] of Object.entries(extra?.tags ?? {})) {
    const p = layout.nodes.get(Number(u));
    if (!p) continue;
    shapes.push({
      kind: 'text',
      id: `tag-${u}`,
      x: p.x,
      y: p.y - R - 8,
      text,
      size: 14,
      anchor: 'middle',
      cls: 'label',
      weight: 'bold',
    });
    boxes.push({ x: p.x - 14, y: p.y - R - 24, w: 28, h: 18 });
  }

  // A key on its way out, or a refused argument, left of the first tree.
  if (extra !== undefined) {
    const shown = extra.out
      ? { id: 'out', label: extra.out.label, text: String(extra.out.key), role: roles.get('out') }
      : extra.arg
        ? {
            id: 'arg',
            label: extra.arg.label,
            text: extra.arg.text.length > 8 ? `${extra.arg.text.slice(0, 7)}…` : extra.arg.text,
            role: roles.get('arg-box'),
          }
        : null;
    const w = Math.max(BOX_W, (shown?.text.length ?? 0) * 10 + 18);
    const labelW = Math.max(4, shown?.label.length ?? 4) * 9;
    const right = -16;
    const left = right - w - 8 - labelW;
    boxes.push({ x: left, y: -18, w: -left, h: 36 });
    if (shown) {
      const x = right - w;
      shapes.push({
        kind: 'text',
        id: `${shown.id}-label`,
        x: x - 8,
        y: 5,
        text: shown.label,
        size: 15,
        anchor: 'end',
        cls: 'label',
        mono: true,
      });
      shapes.push({
        kind: 'rect',
        id: `${shown.id}-box`,
        x,
        y: -16,
        w,
        h: 32,
        r: 6,
        cls: 'ghost',
        role: shown.role,
      });
      const size = labelSize(shown.text);
      shapes.push({
        kind: 'text',
        id: shown.id,
        x: x + w / 2,
        y: size * 0.35,
        text: shown.text,
        size,
        anchor: 'middle',
        weight: 'bold',
        role: shown.role,
        z: 3,
      });
    }
  }
  const n = count(s.nodes, s.roots);
  return {
    shapes,
    bounds: padBounds(unionBounds(...boxes), 14),
    label: n === 0 ? 'An empty pairing heap.' : describe(s),
  };
}
