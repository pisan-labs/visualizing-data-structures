import type { MarkRole } from '../../engine/types';
import { barsGeometry, barsScene, type BarsFrame } from '../../layouts/bars';
import type { Scene, Shape } from '../../render/scene';
import type { Item } from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import type { BucketSettings, BucketStep } from './model';

const live = (x: Item | null | undefined): x is Item => !!x && !x.stale;

const HEAD = 34;
const CELL_H = 38;
const GAP = 4;
const PAD = 6;

/**
 * A on top, drawn like the other sorting pages, and one bucket per value below it, bucket i
 * under A[i]. Values leave A for the back of their bucket, move up the bucket while insertion
 * sort puts it in order, and go back into A bucket by bucket.
 */
export function view(step: BucketStep, settings: BucketSettings): Scene {
  const { state, extra = {} } = step;
  const n = state.a.length;
  const fractions = settings.values === 'fraction';
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const frame: BarsFrame = {
    mode: settings.draw,
    slots: Math.max(1, n),
    max: fractions ? 1 : Math.max(1, ...state.a.map((x) => x.value)),
    pointerLanes: 0,
    barHeight: 110,
  };
  const g = barsGeometry(frame);
  const { shapes, bounds } = barsScene(frame, {
    rows: [
      {
        id: 'a',
        label: 'A',
        items: state.a.map((x) => (live(x) ? x : null)),
        ghosts: state.a.flatMap((x, index) => (x.stale ? [{ index, value: x.value }] : [])),
        from: 0,
        to: n - 1,
      },
    ],
    regions: extra.regions,
    roles,
  });
  const out: Shape[] = shapes;
  let height = bounds.h;

  if (extra.buckets) {
    const depth = Math.max(1, extra.depth ?? 1);
    // Deep buckets get shorter cells, so the drawing stays readable on a short laptop screen.
    const cellH = depth > 4 ? 30 : CELL_H;
    const gap = depth > 4 ? 3 : GAP;
    const top = bounds.h + 4;
    const colH = depth * (cellH + gap) - gap + 2 * PAD;
    const longest = Math.max(1, ...state.a.map((x) => String(x.value).length));
    const size = Math.min(24, Math.floor((g.pitch - 12) / (longest * 0.6)));
    extra.buckets.forEach((bucket, b) => {
      const x = g.left(b);
      out.push({
        kind: 'text',
        id: `bucket-${b}-label`,
        x: x + g.pitch / 2,
        y: top + 24,
        text: String(b),
        size: 20,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        cls: 'label',
      });
      out.push({
        kind: 'rect',
        id: `bucket-${b}`,
        x: x + 2,
        y: top + HEAD,
        w: g.pitch - 4,
        h: colH,
        r: 6,
        cls: 'ghost',
        z: 0.5,
      });
      bucket.forEach((item, k) => {
        const y = top + HEAD + PAD + k * (cellH + gap);
        const role = roles.get(`v${item.uid}`);
        out.push({
          kind: 'rect',
          id: `bar-${item.uid}`,
          x: x + 5,
          y,
          w: g.pitch - 10,
          h: cellH,
          r: 5,
          cls: 'cell live',
          role,
        });
        out.push({
          kind: 'text',
          id: `v${item.uid}`,
          x: x + g.pitch / 2,
          y: y + cellH / 2 + size * 0.36,
          text: String(item.value),
          size,
          anchor: 'middle',
          weight: 'bold',
          role,
        });
      });
    });
    height = top + HEAD + colH + 12;
  }
  return { shapes: out, bounds: { ...bounds, h: height }, label: label(step) };
}

function label(step: BucketStep): string {
  const parts = [describeArray(step.state)];
  const b = step.extra?.buckets;
  if (b?.some((x) => x.length))
    parts.push(
      `Buckets: ${b
        .map((items, i) => (items.length ? `${i}: ${items.map((x) => x.value).join(' ')}` : ''))
        .filter(Boolean)
        .join('; ')}.`,
    );
  return parts.join(' ');
}
