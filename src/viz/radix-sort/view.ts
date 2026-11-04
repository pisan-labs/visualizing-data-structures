import type { MarkRole } from '../../engine/types';
import { barsScene, type BarsFrame } from '../../layouts/bars';
import type { Scene, Shape } from '../../render/scene';
import type { Item } from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import { digitOf, digitText, type RadixSettings, type RadixStep } from './model';

const live = (x: Item | null | undefined): x is Item => !!x && !x.stale;

const HEAD = 34;
const CELL_H = 38;
const GAP = 4;
const PAD = 6;
/** The narrowest a bucket column gets, so three digits fit. */
const MIN_COL = 50;

/** Move a shape right by dx. */
function shift(s: Shape, dx: number): Shape {
  if (s.kind === 'arrow') return { ...s, x1: s.x1 + dx, x2: s.x2 + dx };
  return { ...s, x: s.x + dx };
}

/**
 * A on top, drawn like the other sorting pages. During a pass the digit that pass sorts by
 * sits under each value. Below are the buckets, one column per digit value; a value leaves A
 * for the back of its bucket, and the buckets empty back into A in order.
 */
export function view(step: RadixStep, settings: RadixSettings): Scene {
  const { state, extra = {} } = step;
  const n = state.a.length;
  const base = settings.base;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const frame: BarsFrame = {
    mode: settings.draw,
    slots: Math.max(1, n),
    max: Math.max(1, ...state.a.map((x) => x.value)),
    pointerLanes: 0,
    barHeight: 110,
  };
  const place = extra.place;
  const { shapes, bounds } = barsScene(frame, {
    rows: [
      {
        id: 'a',
        label: 'A',
        items: state.a.map((x) => (live(x) ? x : null)),
        ghosts: state.a.flatMap((x, index) => (x.stale ? [{ index, value: x.value }] : [])),
        from: 0,
        to: n - 1,
        indexLabel:
          place === undefined
            ? undefined
            : (i) => {
                const x = state.a[i];
                return x && !x.stale ? digitText(digitOf(x.value, place, base)) : '';
              },
      },
    ],
    regions: extra.regions,
    roles,
  });
  // Many buckets need more room than A does: widen the frame and keep A in the middle.
  const width = Math.max(bounds.w, base * MIN_COL + 20);
  const dx = (width - bounds.w) / 2;
  const out: Shape[] = dx ? shapes.map((s) => shift(s, dx)) : shapes;
  let height = bounds.h;

  if (extra.buckets) {
    const depth = Math.max(1, extra.depth ?? 1);
    const top = bounds.h + 4;
    const bp = Math.min(64, Math.floor((width - 20) / base));
    const left = (width - base * bp) / 2;
    const colH = depth * (CELL_H + GAP) - GAP + 2 * PAD;
    // Three digits must fit the cell inside a column.
    const size = Math.min(24, Math.floor((bp - 10) / 1.8));
    for (let d = 0; d < base; d++) {
      const x = left + d * bp;
      out.push({
        kind: 'text',
        id: `bucket-${d}-label`,
        x: x + bp / 2,
        y: top + 24,
        text: digitText(d),
        size: 20,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        cls: 'label',
      });
      out.push({
        kind: 'rect',
        id: `bucket-${d}`,
        x: x + 2,
        y: top + HEAD,
        w: bp - 4,
        h: colH,
        r: 6,
        cls: 'ghost',
        z: 0.5,
      });
      extra.buckets[d]!.forEach((item, k) => {
        const y = top + HEAD + PAD + k * (CELL_H + GAP);
        const role = roles.get(`v${item.uid}`);
        out.push({
          kind: 'rect',
          id: `bar-${item.uid}`,
          x: x + 5,
          y,
          w: bp - 10,
          h: CELL_H,
          r: 5,
          cls: 'cell live',
          role,
        });
        out.push({
          kind: 'text',
          id: `v${item.uid}`,
          x: x + bp / 2,
          y: y + CELL_H / 2 + size * 0.36,
          text: String(item.value),
          size,
          anchor: 'middle',
          weight: 'bold',
          role,
        });
      });
    }
    height = top + HEAD + colH + 12;
  }
  return { shapes: out, bounds: { ...bounds, w: width, h: height }, label: label(step, base) };
}

function label(step: RadixStep, base: number): string {
  const parts = [describeArray(step.state)];
  const b = step.extra?.buckets;
  if (b?.some((x) => x.length))
    parts.push(
      `Buckets: ${b
        .map((items, d) =>
          items.length ? `${digitText(d)}: ${items.map((x) => x.value).join(' ')}` : '',
        )
        .filter(Boolean)
        .join('; ')}.`,
    );
  if (step.extra?.pass) parts.push(`Pass ${step.extra.pass} in base ${base}.`);
  return parts.join(' ');
}
