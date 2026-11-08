/**
 * The transformed string T along the top with P under it, the pointers i, C and R (and i' while
 * a radius is copied), the palindrome around C as a tinted span, the one growing around i as
 * another, the two cells compared now, and the longest palindrome so far as a row under it all.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { alignScene, fitOn, type AlignFrame, type AlignRow } from '../../layouts/align';
import type { Scene, Shape } from '../../render/scene';
import { arcShape, pointerShapes, spanShapes, type Pointer } from '../_strings/overlay';
import {
  describe,
  palindromeOf,
  type ManacherExtra,
  type ManacherSettings,
  type ManacherState,
} from './model';

export function view(
  step: Step<ManacherState, ManacherExtra>,
  settings: ManacherSettings,
  stage?: StageSize,
): Scene {
  const st = step.state;
  const extra = step.extra ?? {};
  const N = st.t.length;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  const frameOf = (pitch: number): AlignFrame => ({
    cols: N,
    rows: 1,
    pointer: true,
    values: true,
    valueChars: 2,
    foundLanes: 1,
    pitch,
  });
  const fit = fitOn(stage, frameOf);
  const frame = { ...frameOf(fit.pitch), ...fit };
  const b = st.best;
  const rows: AlignRow[] =
    b && b.radius > 0
      ? [
          {
            id: 'best',
            shift: 0,
            from: b.center - b.radius,
            to: b.center + b.radius,
            found: true,
            label: 'best',
          },
        ]
      : [];
  const {
    shapes,
    bounds,
    geometry: g,
  } = alignScene(frame, {
    text: st.t,
    pattern: st.t,
    rows,
    values: {
      name: 'P',
      items: st.p.map((v) => (v === null ? null : String(v))),
      tones: st.p.map((v, k): MarkRole | undefined =>
        b && k === b.center && v === b.radius && b.radius > 0 ? 'found' : undefined,
      ),
    },
    roles,
  });
  const more: Shape[] = [];
  const mirror = settings.method === 'mirror';
  if (mirror && st.r > 0) more.push(...spanShapes(g, 'pal', 2 * st.c - st.r, st.r, 'visit'));
  const at = st.last;
  if (at !== null && st.i >= 0) {
    const k = st.p[at] ?? 0;
    if (k > 0)
      more.push(
        ...spanShapes(g, 'cur', at - k, at + k, 'active', {
          top: g.textTop + 6,
          bottom: g.textBottom - 6,
          outline: false,
        }),
      );
  }
  if (extra.copy) {
    const y = g.textBottom + 4 + 32;
    more.push(arcShape(g, 'copy', extra.copy.from, extra.copy.to, y, 6, 'active'));
  }
  if (st.i >= 0) {
    const ptrs: Pointer[] = [];
    const i = st.last ?? st.i;
    if (i < N) ptrs.push({ name: 'i', at: i });
    if (extra.copy) ptrs.push({ name: "i'", at: extra.copy.from, role: 'compare' });
    if (mirror && st.r > 0) {
      ptrs.push({ name: 'C', at: st.c, role: 'visit' });
      ptrs.push({ name: 'R', at: st.r, role: 'visit' });
    }
    more.push(...pointerShapes(g, ptrs, roles));
  }
  return { shapes: [...shapes, ...more], bounds, label: label(step) };
}

function label(step: Step<ManacherState, ManacherExtra>): string {
  const p = step.extra?.pair;
  const t = step.state.t;
  const now = p ? ` Comparing T[${p[0]}] = ${t[p[0]]} with T[${p[1]}] = ${t[p[1]]}.` : '';
  const best = step.state.best;
  const longest = best && best.radius ? ` Best: ${palindromeOf(step.state.s, best)}.` : '';
  return describe(step.state) + now + longest;
}
