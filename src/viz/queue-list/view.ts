import type { MarkRole, Step } from '../../engine/types';
import { drawChain, type ChainNode } from '../../layouts/node-chain';
import type { Scene } from '../../render/scene';
import { describe, type QueueListExtra, type QueueListState } from './model';

export function view(step: Step<QueueListState, QueueListExtra>): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const n = state.nodes.length;
  const nodes: ChainNode[] = [];
  // A node just dequeued sits before the new front; a node being enqueued after the rear.
  if (extra.old) {
    const { node, garbage } = extra.old;
    nodes.push({ ...node, status: garbage ? 'garbage' : 'live', next: n > 0 });
  }
  const offset = nodes.length;
  state.nodes.forEach((node, k) =>
    nodes.push({ ...node, next: k < n - 1 || (k === n - 1 && !!extra.fresh?.linked) }),
  );
  if (extra.fresh) {
    const { uid, value, linked } = extra.fresh;
    nodes.push({ uid, value, status: linked ? 'live' : 'pending', next: false });
  }
  const head = extra.ptr?.head !== undefined ? extra.ptr.head : n ? offset : null;
  const tail = extra.ptr?.tail !== undefined ? extra.ptr.tail : n ? offset + n - 1 : null;
  const { shapes, bounds } = drawChain({
    kind: 'single',
    nodes,
    pointers: [
      { name: 'head', to: head, side: 'above' },
      { name: 'tail', to: tail, side: 'below' },
    ],
    roles,
    out: extra.out && { ...extra.out, from: 0 },
  });
  return { shapes, bounds, label: describe(state) };
}
