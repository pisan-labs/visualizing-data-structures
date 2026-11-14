import type { StageSize, Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { describeThreads, threadsScene } from '../_threads2/page';
import { sizeOf, spec, type PcSettings, type PcState } from './model';

export function describe(s: PcState, settings: PcSettings): string {
  const n = s.m.mem.n ?? 0;
  return `${describeThreads(spec, s, settings)} The buffer holds ${n} of ${sizeOf(settings)}.`;
}

export function view(step: Step<PcState>, settings: PcSettings, stage?: StageSize): Scene {
  return threadsScene(spec, step, settings, stage, { label: describe(step.state, settings) });
}
