import type { MarkRole, Step } from '../../engine/types';
import { padBounds, unionBounds } from '../../layouts/binary-tree';
import { drawTrie, layoutTrie, RING } from '../../layouts/trie';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { argWidth, drawArg, drawOutput } from '../_trie/draw';
import {
  describe,
  heightOf,
  prefixOf,
  type TrieExtra,
  type TrieSettings,
  type TrieState,
} from './model';

const R = 10;
/**
 * The "root" label and the word being processed sit left of the root and above its center
 * line. Everything else in the trie is below that line (edges leave the root downward), so they
 * never collide with it, and they cost almost no height, which a short desktop stage lacks.
 */
const ROOT_LABEL = { x: -R - 4, y: -3 };
const ARG = { right: ROOT_LABEL.x - 42, y: -15 };

/** Deep tries get closer levels so they still fit a short screen. */
function levelGapFor(height: number): number {
  return height <= 4 ? 58 : Math.max(50, 58 - 3 * (height - 4));
}

export function view(step: Step<TrieState, TrieExtra>, _settings?: TrieSettings): Scene {
  const { state: s } = step;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const kids = (u: number) => s.nodes[u]!.kids;
  const layout = layoutTrie(s.root, kids, {
    label: (u) => s.nodes[u]!.ch,
    halfWidth: (u) => (s.nodes[u]!.end ? R + RING : R),
    radius: R,
    labelSize: 15,
    gap: 10,
    levelGap: levelGapFor(heightOf(s)),
  });
  const path = new Set(extra.path ?? []);
  const seen = new Set(extra.seen ?? []);
  const shapes: Shape[] = drawTrie(layout, {
    isEnd: (u) => s.nodes[u]!.end,
    roles,
    baseRole: (u) => (path.has(u) || seen.has(u) ? 'visit' : undefined),
    // The edges walked so far, from the root down to the current node.
    edgeRole: (u) => (path.has(u) && u !== s.root ? 'active' : undefined),
    enterFrom: (u) => {
      if (u !== extra.fresh) return undefined;
      const p = layout.nodes.get(s.nodes[u]!.parent!);
      return p && { x: p.x, y: p.y };
    },
  });

  const boxes: Bounds[] = [{ ...layout.bounds }];
  shapes.push({
    kind: 'text',
    id: 'root-label',
    x: ROOT_LABEL.x,
    y: ROOT_LABEL.y,
    text: 'root',
    size: 13,
    anchor: 'end',
    cls: 'label',
    mono: true,
  });
  boxes.push({ x: ROOT_LABEL.x - 32, y: ROOT_LABEL.y - 11, w: 32, h: 12 });
  if (s.nodes[s.root]!.kids.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: R + 24,
      text: 'empty trie',
      size: 14,
      anchor: 'middle',
      cls: 'label',
    });
    boxes.push({ x: -45, y: R + 8, w: 90, h: 20 });
  }

  // A plain picture (no step data, as in practice questions) has no word in progress.
  if (step.extra !== undefined && extra.arg) {
    const arg = drawArg(extra.arg, ARG.right - argWidth(extra.arg), ARG.y, roles);
    shapes.push(...arg.shapes);
    boxes.push(arg.bounds);
  }

  // startsWith writes its words under the trie.
  if (extra.output) {
    const tree = unionBounds(...boxes);
    const y0 = layout.bounds.y + layout.bounds.h + 26;
    const out = drawOutput(extra.output, tree.x, y0, Math.max(tree.w, 260), roles, (i) => {
      const word = extra.output![i]!;
      // A new word slides out of the node where it ends.
      for (const n of layout.nodes.values()) {
        if (s.nodes[n.id]!.end && prefixOf(s, n.id) === word) return { x: n.x, y: n.y };
      }
      return undefined;
    });
    shapes.push(...out.shapes);
    boxes.push(out.bounds);
  }

  return {
    shapes,
    bounds: padBounds(unionBounds(...boxes), 14),
    label: describe(s),
  };
}
