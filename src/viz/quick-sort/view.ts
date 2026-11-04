import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { QuickSettings } from './model';

export function view(step: ArrayStep, settings: QuickSettings): Scene {
  // The call stack on top; two label lanes so "≤ x" and "> x" never collide.
  return arrayView(step, settings.draw, {
    calls: true,
    regionLanes: 2,
    pointerLanes: 2,
    barHeight: 150,
    callsHeight: 80,
  });
}
