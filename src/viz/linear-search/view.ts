import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { LinearSettings } from './model';

export function view(step: ArrayStep, settings: LinearSettings): Scene {
  // The sentinel's spare slot gets a dashed outline, so it does not pass for part of A.
  const n = step.state.a.length;
  const shown: ArrayStep = step.extra?.sentinel
    ? {
        ...step,
        extra: {
          ...step.extra,
          regions: [...(step.extra.regions ?? []), { id: 'spare', from: n, to: n, tone: 'window' }],
        },
      }
    : step;
  // x hovers over the slot being checked; the sentinel version has one spare slot.
  return arrayView(shown, settings.draw, {
    held: true,
    pointerLanes: 1,
    sentinel: settings.sentinel,
  });
}
