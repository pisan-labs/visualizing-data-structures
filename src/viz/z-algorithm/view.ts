/**
 * S along the top with Z under it (the value lane), the prefix of S slid under the position
 * being worked on (known cells dashed: copied from the box, never compared), the pointers i, l
 * and r, and the box [l, r] as a tinted span. While Z[i] is copied, the mirror S[0..r − l] is
 * tinted too and an arrow runs from Z[i − l] to Z[i]. Matches of P in T are shaded.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { alignScene, fitOn, type AlignFrame, type AlignRow } from '../../layouts/align';
import type { Scene, Shape } from '../../render/scene';
import { arcShape, pointerShapes, spanShapes, type Pointer } from '../_strings/overlay';
import { describe, textId, type ZExtra, type ZSettings, type ZState } from './model';

export function view(step: Step<ZState, ZExtra>, settings: ZSettings, stage?: StageSize): Scene {
  const st = step.state;
  const extra = step.extra ?? {};
  const n = st.s.length;
  const m = st.pattern?.length ?? 0;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  for (const f of st.found)
    for (let k = f + m + 1; k < f + 2 * m + 1; k++)
      if (!roles.has(textId(k))) roles.set(textId(k), 'found');
  const frameOf = (pitch: number): AlignFrame => ({
    cols: Math.max(n, 1),
    rows: 1,
    pointer: true,
    values: true,
    valueChars: 2,
    foundLanes: 1,
    pitch,
  });
  const fit = fitOn(stage, frameOf);
  const frame = { ...frameOf(fit.pitch), ...fit };
  const row = st.row;
  const rows: AlignRow[] = row
    ? [{ id: 'z', shift: row.i, from: 0, to: n - 1 - row.i, cells: row.cells, label: `i=${row.i}` }]
    : [];
  const tones = st.z.map((v, k): MarkRole | undefined =>
    m > 0 && v === m && k > m ? 'found' : undefined,
  );
  const {
    shapes,
    bounds,
    geometry: g,
  } = alignScene(frame, {
    text: st.s,
    textName: 'S',
    pattern: st.s,
    rows,
    values: {
      name: 'Z',
      items: st.z.map((v, k) =>
        k === 0 ? (st.i > 0 ? '–' : null) : v === null ? null : String(v),
      ),
      tones,
    },
    ...(extra.pair && row ? { pair: { i: extra.pair.i, row: 'z', j: extra.pair.j } } : {}),
    roles,
  });
  const more: Shape[] = [];
  const box = settings.method === 'box';
  if (box && st.r > 0) more.push(...spanShapes(g, 'box', st.l, st.r, 'active'));
  if (box && extra.mirror && st.r > 0)
    more.push(...spanShapes(g, 'mirror', 0, st.r - st.l, 'visit'));
  if (extra.copy) {
    const y = g.textBottom + 4 + 32;
    more.push(arcShape(g, 'copy', extra.copy.from, extra.copy.to, y, 6, 'active'));
  }
  if (st.i > 0) {
    const ptrs: Pointer[] = [];
    const at = row?.i ?? st.i;
    if (at < n) ptrs.push({ name: 'i', at });
    if (box && st.r > 0) {
      ptrs.push({ name: 'l', at: st.l, role: 'visit' });
      ptrs.push({ name: 'r', at: st.r, role: 'visit' });
    }
    more.push(...pointerShapes(g, ptrs, roles));
  }
  return { shapes: [...shapes, ...more], bounds, label: label(step) };
}

function label(step: Step<ZState, ZExtra>): string {
  const p = step.extra?.pair;
  const s = step.state.s;
  const now = p ? ` Comparing S[${p.i}] = ${s[p.i]} with S[${p.j}] = ${s[p.j]}.` : '';
  return describe(step.state) + now;
}
