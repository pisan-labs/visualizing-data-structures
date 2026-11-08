import { barTop } from '../../layouts/bars';
import type { Scene, Shape } from '../../render/scene';
import type { ArrayStep } from '../_sorting/kit';
import { arrayView } from '../_sorting/view';
import type { InterpolationExtra, InterpolationSettings } from './model';

/**
 * The array with x hovering over the probe, like binary search. In bars mode, the guess as a
 * picture: a straight line from the top of A[lo] to the top of A[hi], a dashed line at the
 * height of x, and a drop from where they meet to the slot it rounds down to.
 */
export function view(step: ArrayStep, settings: InterpolationSettings): Scene {
  const guide = (step.extra as InterpolationExtra | undefined)?.guide;
  const a = step.state.a;
  const show = settings.draw === 'bars' && settings.guide ? guide : undefined;
  return arrayView(step, settings.draw, { held: true, pointerLanes: 3 }, (g, frame) => {
    if (!show || !a[show.lo] || !a[show.hi]) return [];
    const y = (v: number) => barTop(g, frame.max, v);
    const x1 = g.center(show.lo);
    const x2 = g.center(show.hi);
    const xm = g.center(show.at);
    const ym = y(show.x);
    const shapes: Shape[] = [
      {
        kind: 'arrow',
        id: 'guide-line',
        x1,
        y1: y(a[show.lo]!.value),
        x2,
        y2: y(a[show.hi]!.value),
        head: 'none',
        role: 'visit',
        z: 3,
      },
      {
        kind: 'arrow',
        id: 'guide-x',
        x1: x1 - g.pitch / 2,
        y1: ym,
        x2: xm,
        y2: ym,
        head: 'none',
        dashed: true,
        role: 'compare',
        z: 3,
      },
      {
        kind: 'arrow',
        id: 'guide-drop',
        x1: xm,
        y1: ym,
        x2: xm,
        y2: g.row('a').bottom,
        dashed: true,
        role: 'compare',
        z: 3,
      },
      { kind: 'circle', id: 'guide-dot', x: xm, y: ym, r: 6, role: 'compare', z: 3 },
    ];
    return shapes;
  });
}
