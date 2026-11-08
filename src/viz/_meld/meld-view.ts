/**
 * The drawing shared by the leftist and skew heap pages: the heap, a second heap waiting to be
 * merged in to its right, the recursion as an indented list of calls under the trees, and (for
 * a leftist heap) the npl of every node under it.
 */
import type { MarkRole, Step } from '../../engine/types';
import {
  drawBinaryTree,
  labelSize,
  layoutBinaryTree,
  padBounds,
  unionBounds,
  type TreeLayout,
} from '../../layouts/binary-tree';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  conv,
  heightOf,
  meldDescribe,
  type MeldExtra,
  type MeldSettings,
  type MeldState,
  type Variant,
} from './meld';

const R = 17;
/** The waiting heap sits this far right of the heap. */
const SIDE_GAP = 44;
/** The box for a key on its way out ends this far left of the root's center. */
const BOX_RIGHT = -(R + 16);
const BOX_W = 56;
/** The call list: rows reserved so the camera holds still while calls come and go. */
const CALL_ROWS = 3;
const CALL_PITCH = 19;
const CALL_INDENT = 14;

function shifted(t: TreeLayout<number>, dx: number, dy: number): TreeLayout<number> {
  const nodes = new Map(
    [...t.nodes].map(([id, n]) => [id, { ...n, x: n.x + dx, y: n.y + dy }] as const),
  );
  return { ...t, nodes, bounds: { ...t.bounds, x: t.bounds.x + dx, y: t.bounds.y + dy } };
}

export function meldView(variant: Variant) {
  return function view(step: Step<MeldState, MeldExtra>, settings: MeldSettings): Scene {
    const { state: s } = step;
    const extra = step.extra;
    const K = conv(variant, settings);
    const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
    // Deep trees (a leftist heap can be a long left chain) get closer levels.
    const deepest = Math.max(heightOf(s, s.root), heightOf(s, s.other));
    const base = K.leftist ? 56 : 52;
    const levelGap = deepest <= 4 ? base : Math.max(40, base - 3 * (deepest - 4));
    const access = {
      left: (u: number) => s.nodes[u]!.left,
      right: (u: number) => s.nodes[u]!.right,
    };
    const opts = { radius: R, gap: 8, levelGap };
    const main = layoutBinaryTree(s.root, access, opts);
    const path = new Set(extra?.path ?? []);
    const label = (u: number) => String(s.nodes[u]!.key);
    const baseRole = (u: number): MarkRole | undefined => (path.has(u) ? 'visit' : undefined);
    const shapes: Shape[] = drawBinaryTree(main, { label, roles, baseRole });
    const boxes: Bounds[] = [];
    const below = K.leftist ? 18 : 0;
    const treeBox = (t: TreeLayout<number>) => ({ ...t.bounds, h: t.bounds.h + below });

    if (s.root === null) {
      shapes.push({
        kind: 'text',
        id: 'empty',
        x: 0,
        y: 5,
        text: 'empty heap',
        size: 15,
        anchor: 'middle',
        cls: 'label',
        role: roles.get('empty'),
      });
      boxes.push({ x: -44, y: -R, w: 88, h: 2 * R });
    } else {
      boxes.push(treeBox(main));
    }

    // A second heap waiting to be merged in, to the right.
    let other: TreeLayout<number> | null = null;
    if (s.other !== null) {
      const o = layoutBinaryTree(s.other, access, opts);
      const right = s.root === null ? 44 : main.bounds.x + main.bounds.w;
      // One level down, so it and its label stay clear of the zoom buttons in the top corner.
      other = shifted(o, right + SIDE_GAP - o.bounds.x, levelGap);
      shapes.push(...drawBinaryTree(other, { label, roles, baseRole }));
      boxes.push(treeBox(other));
      if (extra?.otherLabel) {
        const top = other.nodes.get(s.other)!;
        shapes.push({
          kind: 'text',
          id: 'other-label',
          x: top.x,
          y: top.y - R - 8,
          text: extra.otherLabel,
          size: 13,
          anchor: 'middle',
          cls: 'label',
          mono: true,
        });
        boxes.push({ x: top.x - 20, y: top.y - R - 22, w: 40, h: 16 });
      }
    }

    // npl under every node of a leftist heap. Winners on the merge path show a stale npl (grey)
    // until the way back up recomputes it.
    if (K.leftist) {
      const pathList = extra?.path ?? [];
      const stale = new Set(pathList.slice(0, pathList.length - (extra?.fixed ?? 0)));
      for (const t of [main, other]) {
        if (!t) continue;
        for (const n of t.nodes.values()) {
          const id = `npl-${n.id}`;
          shapes.push({
            kind: 'text',
            id,
            x: n.x,
            y: n.y + R + 13,
            text: String(K.npl(s.nodes[n.id]!)),
            size: 13,
            anchor: 'middle',
            cls: 'label',
            mono: true,
            role: roles.get(id) ?? (stale.has(n.id) ? 'stale' : undefined),
          });
        }
      }
    }

    // Steps of an operation keep room for a returned key and for the calls, so the camera
    // holds still. A plain picture (no step data, as in practice questions) leaves both out.
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
      const right = s.root === null ? -52 : BOX_RIGHT;
      const left = right - w - 8 - 4 * 9;
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

      // The recursion, outermost call first, each nested call indented.
      const frames = extra.frames ?? [];
      const all = unionBounds(...boxes);
      const x0 = all.x;
      const y0 = all.y + all.h + 26;
      if (frames.length) {
        shapes.push({
          kind: 'text',
          id: 'calls-label',
          x: x0,
          y: y0,
          text: 'calls',
          size: 13,
          cls: 'label',
        });
      }
      frames.forEach((f, i) => {
        shapes.push({
          kind: 'text',
          id: `call-${i}`,
          x: x0 + 8 + i * CALL_INDENT,
          y: y0 + (i + 1) * CALL_PITCH,
          text: f,
          size: 13,
          mono: true,
          weight: i === frames.length - 1 ? 'bold' : 'normal',
          role: i === frames.length - 1 ? 'active' : undefined,
          cls: i === frames.length - 1 ? undefined : 'label',
        });
      });
      const rows = Math.max(CALL_ROWS, frames.length);
      const widest = Math.max(120, ...frames.map((f, i) => 8 + i * CALL_INDENT + f.length * 7.8));
      boxes.push({ x: x0, y: y0 - 14, w: widest, h: rows * CALL_PITCH + 18 });
    }

    return {
      shapes,
      bounds: padBounds(unionBounds(...boxes), 14),
      label: meldDescribe(variant, s, settings),
    };
  };
}
