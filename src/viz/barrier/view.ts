import type { StageSize, Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { describeRows, rowsScene } from '../_threads3/page';
import { departures, macro, spec, type BarrierSettings, type BarrierState } from './model';

export function describe(s: BarrierState, settings: BarrierSettings): string {
  const mac = macro(settings);
  const d = departures(mac, s.m, settings);
  const gone = d.gone.map((t) => mac.p.threads[t]!.name);
  return `${describeRows(spec, s, settings)} Gone on so far: ${gone.length ? gone.join(', ') : 'nobody'}.`;
}

export function view(
  step: Step<BarrierState>,
  settings: BarrierSettings,
  stage?: StageSize,
): Scene {
  return rowsScene(spec, step, settings, stage, { label: describe(step.state, settings) });
}
