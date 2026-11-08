import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { TernarySettings } from './model';

export function view(step: ArrayStep, settings: TernarySettings): Scene {
  // lo, m1, m2 and hi can crowd one slot near the end, so three pointer lanes.
  return arrayView(step, settings.draw, { held: true, pointerLanes: 3 });
}
