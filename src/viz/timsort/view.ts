import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { TimSettings } from './model';

export function view(step: ArrayStep, settings: TimSettings): Scene {
  // The runs on the stack are labeled bands (X on top, then Y, Z, W); tmp is the second row.
  return arrayView(step, settings.draw, { aux: true, regionLanes: 2, pointerLanes: 2 });
}
