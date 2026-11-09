/**
 * The array (bars or cells) with i under it, the answers row under the array's columns, and the
 * stack as a row of boxes under that, bottom on the left. Indices on the stack are outlined in
 * the array too, so the decreasing (or increasing) staircase they form is visible where the
 * values are. The histogram draws the rectangle being measured over the bars.
 */
import type { MarkRole } from '../../engine/types';
import { barsGeometry, barsScene, barTop, type BarsFrame } from '../../layouts/bars';
import type { Scene, Shape } from '../../render/scene';
import { describeArray } from '../_sorting/view';
import { CELL_ROW_H, cellRowShapes, grow, LIST_ROW_H, listRowShapes } from '../_techniques/kit';
import type { MonoStep, StackSettings } from './model';

export function view(step: MonoStep, settings: StackSettings): Scene {
  const { state } = step;
  const extra = step.extra ?? {};
  const n = state.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const stack = extra.stack ?? [];
  // Values on the stack are outlined in the array, unless a mark says otherwise.
  for (const k of stack) {
    const id = `v${state.a[k]!.uid}`;
    if (!roles.has(id)) roles.set(id, 'visit');
  }
  const frame: BarsFrame = {
    mode: settings.draw,
    slots: n,
    max: Math.max(1, ...state.a.map((x) => x.value)),
    regionLanes: extra.rect ? 1 : 0,
    pointerLanes: 1,
    barHeight: 150,
  };
  const g = barsGeometry(frame);
  const rect = extra.rect;
  const bars = barsScene(frame, {
    rows: [{ id: 'a', label: 'A', items: state.a }],
    pointers: extra.pointers,
    regions: rect
      ? [
          {
            id: 'rect',
            from: rect.from,
            to: rect.to,
            tone: 'window',
            label: `${rect.h} × ${rect.to - rect.from + 1} = ${rect.h * (rect.to - rect.from + 1)}`,
          },
        ]
      : [],
    roles,
  });
  const shapes: Shape[] = [...bars.shapes];
  if (rect && settings.draw === 'bars' && rect.to >= rect.from) {
    const top = barTop(g, frame.max, rect.h);
    const bottom = g.row('a').bottom;
    const x1 = g.left(rect.from) + 2;
    const x2 = g.left(rect.to + 1) - 2;
    shapes.push({
      kind: 'polygon',
      id: 'rect-fill',
      points: [
        { x: x1, y: top },
        { x: x2, y: top },
        { x: x2, y: bottom },
        { x: x1, y: bottom },
      ],
      role: rect.best ? 'found' : 'active',
      z: 1.2,
    });
  }
  let bounds = bars.bounds;
  let y = bounds.h - 6;
  if (extra.answers) {
    const texts = extra.answers.map((a) => (a === undefined ? '' : a === null ? '–' : String(a)));
    shapes.push(
      ...cellRowShapes(g, { id: 'ans', name: extra.answerName ?? 'answer', texts, roles }, y),
    );
    bounds = grow(bounds, 0, y, bounds.w, CELL_ROW_H + 4);
    y += CELL_ROW_H + 4;
  }
  if (extra.stack) {
    const valueAt = (k: number) => ({ x: g.center(k), y: g.row('a').valueY });
    shapes.push(
      ...listRowShapes(
        g,
        {
          id: 'stk',
          name: 'stack, bottom on the left, top on the right',
          items: stack.map((k) => ({
            key: state.a[k]!.uid,
            text: String(state.a[k]!.value),
            sub: `[${k}]`,
            from: valueAt(k),
          })),
          slots: n,
          roles,
        },
        y,
      ),
    );
    bounds = grow(bounds, 0, y, bounds.w, LIST_ROW_H + 8);
  }
  return { shapes, bounds, label: label(step) };
}

function label(step: MonoStep): string {
  const e = step.extra ?? {};
  const a = step.state.a;
  const parts = [describeArray(step.state)];
  if (e.pointers?.length) parts.push(`i = ${e.pointers[0]!.at}.`);
  if (e.stack)
    parts.push(
      e.stack.length
        ? `Stack, bottom to top: ${e.stack.map((k) => `${a[k]!.value} (index ${k})`).join(', ')}.`
        : 'The stack is empty.',
    );
  if (e.answers) {
    const known = e.answers
      .map((x, k) => (x === undefined ? null : `${k}: ${x === null ? 'none' : x}`))
      .filter(Boolean);
    if (known.length) parts.push(`${e.answerName ?? 'Answers'}: ${known.join(', ')}.`);
  }
  if (e.rect) parts.push(`Rectangle of height ${e.rect.h} over A[${e.rect.from}..${e.rect.to}].`);
  return parts.join(' ');
}
