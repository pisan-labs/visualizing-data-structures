import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { BinarySettings } from './model';

export function view(step: ArrayStep, settings: BinarySettings): Scene {
  // lo, mid and hi can all point at one slot, so three label lanes. x hovers over mid.
  const recursive = settings.style === 'recursive';
  return arrayView(step, settings.draw, {
    held: true,
    pointerLanes: 3,
    ...(recursive ? { calls: true, barHeight: 150, callsHeight: 80 } : {}),
  });
}
