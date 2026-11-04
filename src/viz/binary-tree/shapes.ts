import type { Rng } from '../../engine/rng';
import { formatLevelOrder, type Token } from './model';

/** Tree shapes for presets and practice, written as level-order lists. */
export type Shape = { left: Shape | null; right: Shape | null };

const leaf = (): Shape => ({ left: null, right: null });

/** Level-order list of a shape, numbering the nodes 1, 2, 3, ... level by level. */
export function shapeToList(root: Shape | null): string {
  if (!root) return '_';
  const out: Token[] = [];
  const queue: (Shape | null)[] = [root];
  let n = 0;
  while (queue.length) {
    const x = queue.shift()!;
    if (!x) {
      out.push(null);
      continue;
    }
    out.push(++n);
    queue.push(x.left, x.right);
  }
  while (out[out.length - 1] === null) out.pop();
  return formatLevelOrder(out);
}

/** A random shape: each new node takes a random free child spot. */
export function randomShape(rng: Rng, n: number): Shape | null {
  if (n <= 0) return null;
  const root = leaf();
  const spots: [Shape, 'left' | 'right'][] = [
    [root, 'left'],
    [root, 'right'],
  ];
  for (let k = 1; k < n; k++) {
    const [parent, side] = spots.splice(rng.int(0, spots.length - 1), 1)[0]!;
    const child = leaf();
    parent[side] = child;
    spots.push([child, 'left'], [child, 'right']);
  }
  return root;
}

/** A random full tree (every node has 0 or 2 children) with n nodes, n odd. */
export function fullShape(rng: Rng, n: number): Shape {
  const root = leaf();
  const leaves = [root];
  for (let count = 1; count + 2 <= n; count += 2) {
    const x = leaves.splice(rng.int(0, leaves.length - 1), 1)[0]!;
    x.left = leaf();
    x.right = leaf();
    leaves.push(x.left, x.right);
  }
  return root;
}

export function completeList(n: number): string {
  return Array.from({ length: n }, (_, i) => i + 1).join(' ');
}

export function skewedList(n: number): string {
  const out: string[] = ['1'];
  for (let k = 2; k <= n; k++) out.push(String(k), '_');
  if (out[out.length - 1] === '_') out.pop();
  return out.join(' ');
}

/** n distinct values from 1 to 99. */
export function distinctValues(rng: Rng, n: number): number[] {
  const values: number[] = [];
  while (values.length < n) {
    const v = rng.int(1, 99);
    if (!values.includes(v)) values.push(v);
  }
  return values;
}

/** A random shape with random distinct values. */
export function randomTreeList(rng: Rng, n: number): string {
  const values = distinctValues(rng, n);
  let k = 0;
  return shapeToList(randomShape(rng, n))
    .split(' ')
    .map((t) => (t === '_' ? t : String(values[k++])))
    .join(' ');
}
