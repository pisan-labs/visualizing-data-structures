import type { MarkRole, StageSize, Step } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import {
  drawStacks,
  fmt,
  opLabel,
  pickStacks,
  valueAt,
  type StackView,
} from '../_design1/kit';
import { describe, MAX_SIZE, vid, type MSExtra, type MSSettings, type MSState } from './model';

/**
 * The stack and, for the pattern, mins beside it: two columns on a phone, two rows on a laptop.
 * With the default "only when at most the minimum", a dashed line joins each entry of mins to
 * the push that put it there: that entry leaves when that value is popped. Pushing every time
 * keeps the two stacks level, so each entry sits beside its own value and needs no line.
 */
export function view(
  step: Step<MSState, MSExtra>,
  settings: MSSettings,
  stage?: StageSize,
): Scene {
  const { state, extra } = step;
  const pattern = approachOf(settings) === 'pattern';
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const { g, bounds } = pickStacks(
    { count: pattern ? 2 : 1, cap: MAX_SIZE, head: 46, minW: 300 },
    stage,
  );
  const slotOf = new Map(state.items.map((it, i) => [it.uid, i]));
  const stacks: StackView[] = [
    {
      key: 'stack',
      name: 'stack',
      values: state.items.map((it, i) => ({
        id: vid(it.uid),
        text: fmt(it.value),
        enterFrom: { x: valueAt(g.cell(0, i)).x, y: g.orient === 'vertical' ? 4 : 30 },
      })),
    },
  ];
  if (pattern) {
    stacks.push({
      key: 'mins',
      name: 'mins',
      values: state.mins.map((m, j) => {
        // A copy of the pushed value slides over from it; a copy of the old minimum, up from it.
        const from = state.items.find((it) => it.uid === m.from);
        const src =
          from && from.value === m.value
            ? g.cell(0, slotOf.get(from.uid)!)
            : g.cell(1, Math.max(0, j - 1));
        return { id: vid(m.uid), text: fmt(m.value), enterFrom: valueAt(src) };
      }),
    });
  }
  const shapes: Shape[] = drawStacks(g, stacks, roles);

  if (pattern && settings.track !== 'every') {
    state.mins.forEach((m, j) => {
      const i = slotOf.get(m.from);
      if (i === undefined) return;
      const a = g.cell(0, i);
      const b = g.cell(1, j);
      const line =
        g.orient === 'vertical'
          ? { x1: a.x + a.w + 4, y1: a.y + a.h / 2, x2: b.x - 4, y2: b.y + b.h / 2 }
          : { x1: a.x + a.w / 2, y1: a.y + a.h + 4, x2: b.x + b.w / 2, y2: b.y - 4 };
      shapes.push({
        kind: 'arrow',
        id: `link-${m.uid}`,
        ...line,
        head: 'none',
        dashed: true,
        opacity: 0.55,
        role: roles.get(vid(m.uid)) === 'found' ? 'found' : undefined,
      });
    });
  }

  if (extra?.label) shapes.push(opLabel(extra.label, roles.get('op-label')));
  return { shapes, bounds, label: describe(state) };
}
