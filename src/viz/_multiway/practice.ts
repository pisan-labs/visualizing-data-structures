/**
 * Helpers for the practice questions of the B-tree family. They read answers out of the
 * model's own steps, so a question always agrees with what the drawing shows.
 */
import type { Rng } from '../../engine/rng';
import type { MarkRole, Step } from '../../engine/types';
import type { BExtra, BKey, BState } from './btree';

type BStep = Step<BState, BExtra>;

export const keyList = (keys: number[]) => keys.map((k) => `\`${k}\``).join(', ');

/** A key from 1 to 99 that is not in `keys`. */
export function freshKey(rng: Rng, keys: number[]): number {
  for (;;) {
    const k = rng.int(1, 99);
    if (!keys.includes(k)) return k;
  }
}

/** The key whose cell a step marks with `role`, looked up in that step's state. */
export function markedKey(step: BStep, role: MarkRole): BKey | null {
  const m = step.marks.find((x) => x.role === role && x.id.startsWith('cell-'));
  if (!m) return null;
  const uid = Number(m.id.slice('cell-'.length));
  for (const n of Object.values(step.state.nodes)) {
    const k = n.keys.find((x) => x.uid === uid);
    if (k) return k;
  }
  return null;
}

/** The keys of the node a step marks with `role`. */
export function markedNode(step: BStep, role: MarkRole): number[] | null {
  const m = step.marks.find((x) => x.role === role && x.id.startsWith('node-'));
  const n = m && step.state.nodes[Number(m.id.slice('node-'.length))];
  return n ? n.keys.map((k) => k.key) : null;
}

/** The key that moved up in the first split of an insert (either way of splitting). */
export function firstMedian(steps: BStep[]): number | null {
  for (const st of steps) {
    if (!st.lines.includes('sp.up') && !st.lines.includes('up.split')) continue;
    const k = markedKey(st, 'active');
    if (k) return k.key;
  }
  return null;
}
