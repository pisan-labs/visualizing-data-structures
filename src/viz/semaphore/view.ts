import type { StageSize, Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { describeThreads, threadsScene } from '../_threads2/page';
import { spec, type SemSettings, type SemState } from './model';

export const describe = (s: SemState, settings: SemSettings) => describeThreads(spec, s, settings);

export function view(step: Step<SemState>, settings: SemSettings, stage?: StageSize): Scene {
  return threadsScene(spec, step, settings, stage);
}
