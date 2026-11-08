import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/binary-tree';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  blockId,
  describe,
  hashId,
  proofId,
  type MerkleExtra,
  type MerkleSettings,
  type MerkleState,
} from './model';

const NODE_W = 46;
const NODE_H = 28;
const PITCH = 52;
const LEVEL_GAP = 58;
const BLOCK_GAP = 58;
const ITEM_W = 64;

/** The proof under the tree (the usual), or in a column beside it on a wide stage. */
export function view(
  step: Step<MerkleState, MerkleExtra>,
  _settings: MerkleSettings,
  stage?: StageSize,
): Scene {
  const under = draw(step, false);
  if (!stage || !step.extra?.proof) return under;
  return pickLayout(stage, [under, draw(step, true)]);
}

function draw(step: Step<MerkleState, MerkleExtra>, beside: boolean): Scene {
  const { state: s, extra } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  const H = s.hashes.length - 1;
  const stale = new Set(extra?.stale ?? []);

  // Centers of every node, leaves evenly spaced, each parent over its children.
  const xs: number[][] = [];
  s.hashes.forEach((lvl, k) => {
    xs.push(
      lvl.map((_, i) => {
        if (k === 0) return i * PITCH;
        const a = xs[k - 1]![2 * i]!;
        const b = xs[k - 1]![2 * i + 1];
        return b === undefined ? a : (a + b) / 2;
      }),
    );
  });
  const yOf = (k: number) => (H - k) * LEVEL_GAP;

  s.hashes.forEach((lvl, k) => {
    lvl.forEach((h, i) => {
      const x = xs[k]![i]!;
      const y = yOf(k);
      const id = hashId(k, i);
      if (k > 0) {
        for (const c of [2 * i, 2 * i + 1]) {
          const cx = xs[k - 1]![c];
          if (cx === undefined) continue;
          shapes.push({
            kind: 'arrow',
            id: `edge-${k - 1}-${c}`,
            x1: cx,
            y1: yOf(k - 1) - NODE_H / 2,
            x2: x,
            y2: y + NODE_H / 2,
            head: 'none',
          });
        }
      }
      const isStale = stale.has(`${k}-${i}`);
      shapes.push({
        kind: 'rect',
        id,
        x: x - NODE_W / 2,
        y: y - NODE_H / 2,
        w: NODE_W,
        h: NODE_H,
        r: 4,
        cls: isStale ? 'ghost' : 'live',
        role: roles.get(id),
      });
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x,
        y: y + 5,
        text: h,
        size: 14,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role: roles.get(id) === 'stale' || isStale ? 'stale' : roles.get(id),
      });
    });
  });

  // The data blocks under the leaves, each hashed up into its leaf.
  const blockY = yOf(0) + BLOCK_GAP;
  s.blocks.forEach((b, i) => {
    const x = xs[0]?.[i] ?? i * PITCH;
    shapes.push({
      kind: 'arrow',
      id: `bedge-${i}`,
      x1: x,
      y1: blockY - NODE_H / 2,
      x2: x,
      y2: yOf(0) + NODE_H / 2 + 2,
    });
    shapes.push({
      kind: 'rect',
      id: blockId(i),
      x: x - NODE_W / 2,
      y: blockY - NODE_H / 2,
      w: NODE_W,
      h: NODE_H,
      r: 0,
      cls: 'live',
      role: roles.get(blockId(i)),
    });
    shapes.push({
      kind: 'text',
      id: `blkt-${b.uid}`,
      x,
      y: blockY + 5,
      text: b.data,
      size: b.data.length > 5 ? 12 : 14,
      anchor: 'middle',
      mono: true,
    });
    shapes.push({
      kind: 'text',
      id: `bidx-${i}`,
      x,
      y: blockY + NODE_H / 2 + 15,
      text: String(i),
      size: 12,
      anchor: 'middle',
      mono: true,
      cls: 'index',
    });
  });

  if (s.blocks.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: 5,
      text: 'no blocks',
      size: 15,
      anchor: 'middle',
      cls: 'label',
    });
    boxes.push({ x: -44, y: -NODE_H / 2, w: 88, h: NODE_H });
  } else {
    const right = (s.blocks.length - 1) * PITCH;
    boxes.push({
      x: -NODE_W / 2,
      y: -NODE_H / 2,
      w: right + NODE_W,
      h: blockY + NODE_H / 2 + 20 + NODE_H / 2,
    });
    const rx = xs[H]![0]!;
    shapes.push({
      kind: 'text',
      id: 'root-label',
      x: rx - NODE_W / 2 - 8,
      y: 5,
      text: 'root',
      size: 14,
      anchor: 'end',
      cls: 'label',
    });
    boxes.push({ x: rx - NODE_W / 2 - 48, y: -10, w: 40, h: 20 });
  }

  // The proof: the sibling hashes collected, then the hash computed from the data.
  const proof = extra?.proof;
  if (proof) {
    const tree = unionBounds(...boxes);
    const items = proof.items.map((it, k) => ({ it, k })).filter(({ it }) => it.side !== null);
    const cells: { id: string; text: string; role?: MarkRole; faded?: boolean }[] = items.map(
      ({ it, k }) => ({
        id: proofId(k),
        text: `${it.side} ${it.hash}`,
        role: roles.get(proofId(k)),
        faded: k < proof.used - 1,
      }),
    );
    const x0 = beside ? tree.x + tree.w + 60 : tree.x + 60;
    const y0 = beside ? tree.y + 40 : tree.y + tree.h + 22;
    shapes.push({
      kind: 'text',
      id: 'proof-label',
      x: x0 - 10,
      y: y0 + NODE_H / 2 + 5,
      text: 'proof',
      size: 14,
      anchor: 'end',
      cls: 'label',
    });
    cells.forEach((cell, j) => {
      const x = beside ? x0 : x0 + j * (ITEM_W + 6);
      const y = beside ? y0 + j * (NODE_H + 8) : y0;
      shapes.push({
        kind: 'rect',
        id: cell.id,
        x,
        y,
        w: ITEM_W,
        h: NODE_H,
        r: 4,
        cls: 'live',
        role: cell.role,
        opacity: cell.faded ? 0.6 : undefined,
      });
      shapes.push({
        kind: 'text',
        id: `${cell.id}-t`,
        x: x + ITEM_W / 2,
        y: y + NODE_H / 2 + 5,
        text: cell.text,
        size: 13,
        anchor: 'middle',
        mono: true,
        role: cell.role,
        opacity: cell.faded ? 0.6 : undefined,
      });
    });
    const n = Math.max(cells.length, 1);
    let cx = beside ? x0 : x0 + n * (ITEM_W + 6) + 40;
    let cy = beside ? y0 + n * (NODE_H + 8) + 14 : y0;
    if (!beside && cx + ITEM_W > tree.x + Math.max(tree.w, 300)) {
      // Wrap the computed hash onto its own row when the row would grow past the tree.
      cx = x0;
      cy = y0 + NODE_H + 12;
    }
    if (proof.computed !== undefined) {
      shapes.push({
        kind: 'text',
        id: 'computed-label',
        x: cx - 8,
        y: cy + NODE_H / 2 + 5,
        text: 'h =',
        size: 14,
        anchor: 'end',
        cls: 'label',
        mono: true,
      });
      shapes.push({
        kind: 'rect',
        id: 'computed',
        x: cx,
        y: cy,
        w: NODE_W,
        h: NODE_H,
        r: 4,
        cls: 'live',
        role: roles.get('computed'),
      });
      shapes.push({
        kind: 'text',
        id: 'computed-t',
        x: cx + NODE_W / 2,
        y: cy + NODE_H / 2 + 5,
        text: proof.computed,
        size: 14,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role: roles.get('computed'),
      });
    }
    // Reserve the whole panel for every step of the proof, so the camera holds still.
    const w = beside ? ITEM_W : Math.max(n * (ITEM_W + 6) + 40 + NODE_W, ITEM_W);
    const h = beside ? n * (NODE_H + 8) + 14 + NODE_H : cy - y0 + NODE_H;
    boxes.push({ x: x0 - 60, y: y0, w: w + 60, h: Math.max(h, NODE_H) });
    if (!beside && cx === x0) boxes.push({ x: x0, y: cy, w: NODE_W, h: NODE_H });
  }

  // A refused argument, in a box left of the tree.
  if (extra?.arg) {
    const tree = unionBounds(...boxes);
    const text = extra.arg.text.length > 8 ? `${extra.arg.text.slice(0, 7)}…` : extra.arg.text;
    const w = Math.max(56, text.length * 10 + 18);
    const x = tree.x - w - 12;
    shapes.push({
      kind: 'text',
      id: 'arg-label',
      x: x - 8,
      y: 5,
      text: extra.arg.label,
      size: 15,
      anchor: 'end',
      cls: 'label',
      mono: true,
    });
    shapes.push({
      kind: 'rect',
      id: 'arg-box',
      x,
      y: -16,
      w,
      h: 32,
      r: 6,
      cls: 'ghost',
      role: roles.get('arg-box'),
    });
    shapes.push({
      kind: 'text',
      id: 'arg',
      x: x + w / 2,
      y: 5,
      text,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get('arg-box'),
    });
    boxes.push({
      x: x - 8 - extra.arg.label.length * 9,
      y: -16,
      w: w + 20 + extra.arg.label.length * 9,
      h: 32,
    });
  }

  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label: describe(s) };
}
