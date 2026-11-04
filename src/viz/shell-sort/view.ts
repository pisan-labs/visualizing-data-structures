import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { ShellSettings } from './model';

export function view(step: ArrayStep, settings: ShellSettings): Scene {
  // temp hovers above the gap, as key does in insertion sort.
  return arrayView(step, settings.draw, { regionLanes: 1, pointerLanes: 2, held: true });
}
