import type { Scene } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { TimSettings } from './model';

export function view(step: ArrayStep, settings: TimSettings): Scene {
  // The runs on the stack are labeled bands (X on top, then Y, Z, W); tmp is the second row.
  // Until the first merge there is no tmp, and reserving its room would draw the array at about
  // half size on a laptop. So the frame grows once, when the first merge starts, and keeps the
  // room for the rest of the sort.
  const e = step.extra;
  return arrayView(step, settings.draw, {
    aux: !!(e?.aux || e?.auxRoom),
    regionLanes: 2,
    pointerLanes: 2,
    barHeight: 96,
  });
}
