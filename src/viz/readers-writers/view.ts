import type { StageSize, Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { describeRows, rowsScene } from '../_threads3/page';
import { inside, macro, spec, type RwSettings, type RwState } from './model';

export function describe(s: RwState, settings: RwSettings): string {
  const mac = macro(settings);
  const ins = mac.p.threads
    .map((th, t) => (inside(mac, s.m, t, settings) ? th.name : ''))
    .filter(Boolean);
  return `${describeRows(spec, s, settings)} In the room: ${ins.length ? ins.join(', ') : 'nobody'}.`;
}

export function view(step: Step<RwState>, settings: RwSettings, stage?: StageSize): Scene {
  return rowsScene(spec, step, settings, stage, { label: describe(step.state, settings) });
}
