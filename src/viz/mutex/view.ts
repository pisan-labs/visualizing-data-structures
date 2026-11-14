import type { StageSize, Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { describeThreads, threadsScene } from '../_threads2/page';
import { spec, type MutexSettings, type MutexState } from './model';

export const describe = (s: MutexState, settings: MutexSettings) =>
  describeThreads(spec, s, settings);

export function view(step: Step<MutexState>, settings: MutexSettings, stage?: StageSize): Scene {
  return threadsScene(spec, step, settings, stage);
}
