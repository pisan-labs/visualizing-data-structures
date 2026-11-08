import type { PseudoBlock, Scalar } from '../../engine/types';
import {
  meldDescribe,
  meldInitialVars,
  meldOps,
  meldPseudocode,
  type MeldSettings,
  type MeldState,
} from '../_meld/meld';
import { meldView } from '../_meld/meld-view';

export interface LeftistSettings extends MeldSettings {
  [key: string]: Scalar;
  /** -1: npl(nil) = -1 and a leaf has 0 (Weiss). 0: npl(nil) = 0 and a leaf has 1 (rank). */
  npl: '-1' | '0';
}

export const defaults: LeftistSettings = { npl: '-1' };

export { init } from '../_meld/meld';

export const ops = meldOps('leftist');

export function pseudocode(settings: LeftistSettings): PseudoBlock[] {
  return meldPseudocode('leftist', settings);
}

export const view = meldView('leftist');

export function describe(s: MeldState, settings: LeftistSettings): string {
  return meldDescribe('leftist', s, settings);
}

export function initialVars(s: MeldState, settings: LeftistSettings): Record<string, Scalar> {
  return meldInitialVars('leftist', s, settings);
}

export function initialSay(_s: MeldState, settings: LeftistSettings): string {
  const nil = settings.npl === '0' ? '0' : '−1';
  return `An empty leftist heap: a min-heap whose every node keeps its null path length (npl), the distance to the nearest empty spot below it, with npl(nil) = ${nil}. Insert some keys, or merge in a second heap.`;
}
