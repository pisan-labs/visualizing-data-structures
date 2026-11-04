import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { BubbleSettings } from './model';

export function view(step: ArrayStep, settings: BubbleSettings): Scene {
  return arrayView(step, settings.draw, {
    regionLanes: 1,
    pointerLanes: settings.lastSwap ? 3 : 1,
  });
}
