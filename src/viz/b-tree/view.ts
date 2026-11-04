import type { Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { multiwayView } from '../_multiway/view';
import { describe, type BExtra, type BState, type BTreeSettings } from './model';

export function view(step: Step<BState, BExtra>, settings: BTreeSettings): Scene {
  return multiwayView(step, (s) => describe(s, settings));
}
