import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { IntroSettings } from './model';

export function view(step: ArrayStep, settings: IntroSettings): Scene {
  // The call stack on top shows the depth; two label lanes for "≤ x", "> x" and the part's job.
  return arrayView(step, settings.draw, {
    calls: true,
    regionLanes: 2,
    pointerLanes: 2,
    barHeight: 150,
    callsHeight: 80,
  });
}
