import type { MarkRole, StageSize, Step } from '../../engine/types';
import { chainCols, drawChain, type ChainNode } from '../../layouts/node-chain';
import type { Scene } from '../../render/scene';
import { describe, type StackListExtra, type StackListState } from './model';

export function view(
  step: Step<StackListState, StackListExtra>,
  _settings?: unknown,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const n = state.nodes.length;
  const nodes: ChainNode[] = state.nodes.map((node, k) => ({ ...node, next: k < n - 1 }));
  // A node being pushed, or one just popped, sits in front of the top.
  if (extra.fresh) {
    const { uid, value, linked } = extra.fresh;
    nodes.unshift({ uid, value, status: 'pending', next: linked && n > 0 });
  } else if (extra.garbage) {
    nodes.unshift({ ...extra.garbage, status: 'garbage', next: n > 0 });
  }
  const front = nodes.length - n;
  const { shapes, bounds } = drawChain({
    kind: 'single',
    cols: chainCols('single', stage),
    nodes,
    pointers: [{ name: 'top', to: n ? front : null, side: 'above' }],
    roles,
    out: extra.out && { ...extra.out, from: 0 },
  });
  return { shapes, bounds, label: describe(state) };
}
