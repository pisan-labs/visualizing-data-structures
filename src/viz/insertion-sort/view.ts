import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { InsertionSettings } from './model';

export function view(step: ArrayStep, settings: InsertionSettings): Scene {
  return arrayView(step, settings.draw, {
    regionLanes: 1,
    pointerLanes: 2,
    // Shifting lifts the key out of the array; it hovers above the gap.
    held: settings.move === 'shift',
  });
}
