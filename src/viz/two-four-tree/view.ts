import type { Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { multiwayView } from '../_multiway/view';
import { describe, type BExtra, type BState, type TwoFourSettings } from './model';

export function view(step: Step<BState, BExtra>, _settings: TwoFourSettings): Scene {
  return multiwayView(step, describe);
}
