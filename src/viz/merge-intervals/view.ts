/**
 * Intervals as bars in lanes over a time axis, as on /activity-selection/ (src/viz/_intervals2).
 *
 * - merge: one lane per interval (sorted by start once the sort step has run), then the lane
 *   "out", the merged list so far, with a dashed line at the end of the last one out. The
 *   naive way has a lane "x" above "out": the interval being placed, growing as it absorbs.
 * - insert: lanes A (the list), x (the new interval) and out. Intervals move down into out as
 *   they are copied; the ones x absorbs disappear into it.
 * - intersect: lanes A, B and out.
 *
 * Each operation fixes its lanes and its axis, so the frame holds still while it runs.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { drawLanes, ivText } from '../_intervals2/kit';
import { describe, plainPicture, type MISettings, type MIStep } from './model';

export function view(step: MIStep, _settings: MISettings, stage?: StageSize): Scene {
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const pic = step.extra?.pic ?? plainPicture(step.state);
  const lay = drawLanes(pic, roles, stage);
  return {
    shapes: lay.shapes,
    bounds: { x: 0, y: 0, w: lay.width, h: lay.bottom + 8 },
    label: label(step),
  };
}

function label(step: MIStep): string {
  const parts = [describe(step.state)];
  const e = step.extra;
  if (e) {
    for (const lane of e.pic.lanes)
      if (lane.name)
        parts.push(
          `${lane.name}: ${lane.bars.length ? lane.bars.map(ivText).join(', ') : 'empty'}.`,
        );
  }
  return parts.join(' ');
}
