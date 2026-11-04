import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { MergeSettings } from './model';

export function view(step: ArrayStep, settings: MergeSettings): Scene {
  // The call stack (or the runs, bottom-up) on top, A, and the L and R copies below A.
  return arrayView(step, settings.draw, {
    calls: true,
    aux: true,
    pointerLanes: 1,
    barHeight: 72,
    callsHeight: 56,
  });
}
