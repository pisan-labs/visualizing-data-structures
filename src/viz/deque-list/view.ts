import type { MarkRole, StageSize, Step } from '../../engine/types';
import { chainCols, drawChain, type ChainNode } from '../../layouts/node-chain';
import type { Scene } from '../../render/scene';
import { describe, type DequeListExtra, type DequeListState, type End } from './model';

export function view(
  step: Step<DequeListState, DequeListExtra>,
  _settings?: unknown,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const n = state.nodes.length;
  const { fresh, old } = extra;

  /** The node drawn outside the list at one end (being added or just removed), if any. */
  const outside = (end: End): ChainNode | undefined => {
    if (fresh?.end === end) {
      const link = fresh.out && n > 0;
      return {
        uid: fresh.uid,
        value: fresh.value,
        status: fresh.back ? 'live' : 'pending',
        next: end === 'first' && link,
        prev: end === 'last' && link,
      };
    }
    if (old?.end === end) {
      return {
        ...old.node,
        status: old.garbage ? 'garbage' : 'live',
        next: end === 'first' && n > 0,
        prev: end === 'last' && n > 0,
      };
    }
    return undefined;
  };
  // Whether the end node of the list still (or already) links to the node outside.
  const linksOut = (end: End) =>
    (fresh?.end === end && fresh.back) || (old?.end === end && old.back);

  const nodes: ChainNode[] = [];
  const before = outside('first');
  if (before) nodes.push(before);
  const offset = nodes.length;
  state.nodes.forEach((node, k) =>
    nodes.push({
      ...node,
      next: k < n - 1 || (k === n - 1 && linksOut('last')),
      prev: k > 0 || (k === 0 && linksOut('first')),
    }),
  );
  const after = outside('last');
  if (after) nodes.push(after);

  const head = extra.ptr?.head !== undefined ? extra.ptr.head : n ? offset : null;
  const tail = extra.ptr?.tail !== undefined ? extra.ptr.tail : n ? offset + n - 1 : null;
  const { shapes, bounds } = drawChain({
    kind: 'double',
    cols: chainCols('double', stage),
    nodes,
    pointers: [
      { name: 'head', to: head, side: 'above' },
      { name: 'tail', to: tail, side: 'below' },
    ],
    roles,
    out: extra.out && {
      value: extra.out.value,
      label: extra.out.label,
      from: extra.out.end === 'first' ? 0 : nodes.length - 1,
    },
  });
  return { shapes, bounds, label: describe(state) };
}
