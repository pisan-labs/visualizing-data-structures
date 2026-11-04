/**
 * The scene both trie pages draw: the trie (src/layouts/trie.ts), a "root" label, the word in
 * progress as letter cells, and the words startsWith writes.
 */
import type { Mark, MarkRole } from '../../engine/types';
import { padBounds, unionBounds } from '../../layouts/binary-tree';
import { drawTrie, layoutTrie, RING } from '../../layouts/trie';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { argWidth, drawArg, drawOutput, type WordArg } from './draw';

export const R = 10;
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

/** What both trie states have in common. */
export interface TrieLike {
  nodes: Record<number, { end: boolean; kids: number[]; parent: number | null }>;
  root: number;
}

/** What both trie pages keep in a step's extra. */
export interface TrieStepExtra {
  arg?: WordArg;
  path?: number[];
  seen?: number[];
  output?: string[];
  fresh?: number;
}

export interface TrieSceneOptions {
  /** The text on the edge into a node. */
  label(u: number): string;
  /** The letters from the root down to a node. */
  spell(u: number): string;
  /** Edges on the longest root-to-leaf path. */
  height: number;
  /** The screen-reader summary. */
  describe: string;
  /** Shown under a lone root. */
  empty: string;
}

export function trieScene(
  s: TrieLike,
  marks: Mark[],
  stepExtra: TrieStepExtra | undefined,
  o: TrieSceneOptions,
): Scene {
  const extra = stepExtra ?? {};
  const roles = new Map<string, MarkRole>(marks.map((m) => [m.id, m.role]));
  const layout = layoutTrie(s.root, (u) => s.nodes[u]!.kids, {
    label: o.label,
    halfWidth: (u) => (s.nodes[u]!.end ? R + RING : R),
    radius: R,
    labelSize: 15,
    gap: 10,
    labelGap: 8,
    levelGap: levelGapFor(o.height),
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
      text: o.empty,
      size: 14,
      anchor: 'middle',
      cls: 'label',
    });
    const w = o.empty.length * 8;
    boxes.push({ x: -w / 2, y: R + 8, w, h: 20 });
  }

  // A plain picture (no step data, as in practice questions) has no word in progress.
  if (stepExtra !== undefined && extra.arg) {
    const arg = drawArg(extra.arg, ARG.right - argWidth(extra.arg), ARG.y, roles);
    shapes.push(...arg.shapes);
    boxes.push(arg.bounds);
  }

  // startsWith writes its words under the trie.
  if (extra.output) {
    const words = extra.output;
    const tree = unionBounds(...boxes);
    const y0 = layout.bounds.y + layout.bounds.h + 26;
    const out = drawOutput(words, tree.x, y0, Math.max(tree.w, 260), roles, (i) => {
      // A new word slides out of the node where it ends.
      for (const n of layout.nodes.values()) {
        if (s.nodes[n.id]!.end && o.spell(n.id) === words[i]) return { x: n.x, y: n.y };
      }
      return undefined;
    });
    shapes.push(...out.shapes);
    boxes.push(out.bounds);
  }

  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label: o.describe };
}
