import type { MarkRole, Step } from '../../engine/types';
import { drawCircular } from '../../layouts/circular-array';
import type { Scene } from '../../render/scene';
import { describe, type QueueExtra, type QueueSettings, type QueueState } from './model';

export function view(step: Step<QueueState, QueueExtra>, settings: QueueSettings): Scene {
  const { state, extra = {} } = step;
  const n = state.capacity;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const live = (i: number) => (i - state.front + n) % n < state.count || extra.hold === i;
  // The count readout shows the code's variable, which is updated one step after rear or front.
  const count = step.vars?.count ?? state.count;
  const { shapes, bounds } = drawCircular({
    layout: settings.layout,
    capacity: n,
    slots: state.slots,
    live,
    front: state.front,
    rear: state.rear,
    readouts: settings.full === 'count' ? [{ id: 'count', text: `count = ${count}` }] : [],
    roles,
    incoming: extra.incoming && { ...extra.incoming, at: state.rear },
    out: extra.out,
  });
  return { shapes, bounds, label: describe(state, settings) };
}
