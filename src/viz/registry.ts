import type { AnyVizDef } from '../engine/types';
import { stackArray } from './stack-array';

/** Every visualization that is live on the site. */
export const vizzes: AnyVizDef[] = [stackArray];

export function getViz(id: string): AnyVizDef | undefined {
  return vizzes.find((v) => v.id === id);
}
