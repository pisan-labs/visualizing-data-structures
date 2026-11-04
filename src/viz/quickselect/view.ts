import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { SelectSettings } from './model';

export function view(step: ArrayStep, settings: SelectSettings): Scene {
  // Up to four pointers (i, j, pivot, target), so three label lanes.
  return arrayView(step, settings.draw, {
    calls: true,
    regionLanes: 2,
    pointerLanes: 3,
    barHeight: 150,
    callsHeight: 80,
  });
}
