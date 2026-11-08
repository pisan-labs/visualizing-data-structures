import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { GnomeSettings } from './model';

export function view(step: ArrayStep, settings: GnomeSettings): Scene {
  return arrayView(step, settings.draw, { regionLanes: 1, pointerLanes: 2 });
}
