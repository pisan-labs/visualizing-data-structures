import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { ExponentialSettings } from './model';

export function view(step: ArrayStep, settings: ExponentialSettings): Scene {
  // lo, mid and hi can share a slot, so three pointer lanes. x hovers over the probe.
  return arrayView(step, settings.draw, { held: true, pointerLanes: 3 });
}
