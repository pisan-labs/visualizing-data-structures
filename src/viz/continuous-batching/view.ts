/**
 * Continuous batching: a Gantt chart of the slots over time, and a table of the requests.
 *
 * The chart has one row per slot and one column per iteration (time runs along the bottom, the
 * numbers on the boundaries). Above it, each request's letter sits where it arrives. A busy cell
 * shows the request's letter in its group color; its first iteration, the prefill, is shaded.
 * An idle cell is dashed, and drawn as an error when a request was waiting for a slot. Under the
 * slots, the tokens through the model and the requests left waiting in each iteration. A dashed
 * line marks now; under static batching a solid line marks where each batch began.
 *
 * The table gives each request's arrival, prompt, length, start, done time and wait. A laptop
 * puts it right of the chart, a phone under it. The chart always has room for HORIZON
 * iterations, so the camera stays still as time runs.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { groupRole } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_CORNER } from '../../render/stage';
import { describe, HORIZON, MAX_REQS, NAMES, wait, type CbSettings, type CbState } from './model';

const CW = 22;
const CH = 28;
const ROW_GAP = 4;
const LABEL_W = 56;
const LANE = 15;
const TITLE = 26;
const TITLE_SIZE = 15;
const VALUE_SIZE = 15;
const SMALL = 13;
const HEAD_SIZE = 13;
const TD_W = 54;
const TD_H = 26;
const GAP = 30;

type Roles = ReadonlyMap<string, MarkRole>;
type TextShape = Extract<Shape, { kind: 'text' }>;

const text = (id: string, x: number, y: number, t: string, o: Partial<TextShape> = {}): Shape => ({
  kind: 'text',
  id,
  x,
  y,
  text: t,
  size: VALUE_SIZE,
  mono: true,
  ...o,
});

const colorOf = (name: string): MarkRole => groupRole(NAMES.indexOf(name) + 1);

/** The most requests that arrive at one time: the lanes of letters above the chart. */
const lanesOf = (s: CbState) => {
  const at = new Map<number, number>();
  for (const r of s.reqs) at.set(r.arrive, (at.get(r.arrive) ?? 0) + 1);
  return Math.max(1, ...at.values());
};

function drawChart(
  out: Shape[],
  s: CbState,
  settings: CbSettings,
  roles: Roles,
  y0: number,
): Bounds {
  const x0 = LABEL_W;
  out.push(
    text('chart-title', 0, y0 + 17, 'slots over time', { size: TITLE_SIZE, weight: 'bold' }),
  );
  const lanes = lanesOf(s);
  const arrTop = y0 + TITLE;
  const label = (id: string, y: number, t: string) =>
    out.push(text(id, x0 - 8, y, t, { size: SMALL, anchor: 'end', cls: 'label' }));
  label('arr-label', arrTop + LANE - 3, 'arrive');
  const seen = new Map<number, number>();
  for (const r of s.reqs) {
    const k = seen.get(r.arrive) ?? 0;
    seen.set(r.arrive, k + 1);
    out.push(
      text(`arr-${r.name}`, x0 + r.arrive * CW + CW / 2, arrTop + (k + 1) * LANE - 3, r.name, {
        size: SMALL,
        anchor: 'middle',
        weight: 'bold',
        role: roles.get(`arr-${r.name}`),
      }),
    );
  }
  const axisY = arrTop + lanes * LANE + 16;
  out.push(
    text('time-label', x0 - 16, axisY, 'time', { size: SMALL, anchor: 'end', cls: 'label' }),
  );
  for (let t = 0; t <= HORIZON; t++)
    out.push(
      text(`tick-${t}`, x0 + t * CW, axisY, String(t), {
        size: SMALL,
        anchor: 'middle',
        cls: 'label',
        role: roles.get(`tick-${t}`),
      }),
    );
  const rowsTop = axisY + 8;
  const rowY = (i: number) => rowsTop + i * (CH + ROW_GAP);
  for (let i = 0; i < settings.slots; i++) {
    out.push(
      text(`slot-${i}`, x0 - 8, rowY(i) + CH / 2 + 5, `slot ${i + 1}`, {
        size: SMALL,
        anchor: 'end',
        weight: 'bold',
        role: roles.get(`slot-${i}`),
      }),
    );
  }
  s.chart.forEach((col, t) =>
    col.forEach((c, i) => {
      const id = `c-${t}-${i}`;
      const x = x0 + t * CW;
      const y = rowY(i);
      if (c.req === null) {
        out.push({
          kind: 'rect',
          id,
          x,
          y,
          w: CW,
          h: CH,
          r: 2,
          cls: 'ghost',
          role: roles.get(id) ?? (c.waiting ? 'error' : undefined),
        });
        if (c.waiting)
          out.push(
            text(`${id}-t`, x + CW / 2, y + CH / 2 + 5, '–', { anchor: 'middle', cls: 'label' }),
          );
        return;
      }
      out.push({
        kind: 'rect',
        id,
        x,
        y,
        w: CW,
        h: CH,
        r: 2,
        cls: 'live',
        shade: c.kind === 'prefill' ? 0.6 : undefined,
        role: roles.get(id) ?? colorOf(c.req),
      });
      out.push(
        text(`${id}-t`, x + CW / 2, y + CH / 2 + 5, c.req, {
          anchor: 'middle',
          weight: c.kind === 'prefill' ? 'bold' : 'normal',
        }),
      );
    }),
  );
  const rowsBottom = rowY(settings.slots) - ROW_GAP;
  const readY = rowsBottom + 20;
  const queueY = readY + 20;
  label('read-label', readY, 'tokens');
  label('queue-label', queueY, 'waiting');
  s.read.forEach((n, t) =>
    out.push(
      text(`read-${t}`, x0 + t * CW + CW / 2, readY, String(n), { size: SMALL, anchor: 'middle' }),
    ),
  );
  s.queue.forEach((n, t) => {
    if (n > 0)
      out.push(
        text(`queue-${t}`, x0 + t * CW + CW / 2, queueY, String(n), {
          size: SMALL,
          anchor: 'middle',
          cls: 'label',
        }),
      );
  });
  if (settings.policy === 'static')
    s.batches.forEach((b, k) =>
      out.push({
        kind: 'arrow',
        id: `batch-${k}`,
        x1: x0 + b * CW,
        y1: rowsTop - 6,
        x2: x0 + b * CW,
        y2: rowsBottom + 6,
        head: 'none',
      }),
    );
  out.push({
    kind: 'arrow',
    id: 'now',
    x1: x0 + s.clock * CW,
    y1: axisY + 4,
    x2: x0 + s.clock * CW,
    y2: queueY + 6,
    head: 'none',
    dashed: true,
    role: roles.get('now'),
  });
  return { x: 0, y: y0, w: x0 + HORIZON * CW + 8, h: queueY + 6 - y0 };
}

const COLS = [
  ['arrive', 'arrive'],
  ['prompt', 'prompt'],
  ['out', 'output'],
  ['start', 'start'],
  ['done', 'done'],
  ['wait', 'wait'],
] as const;

function drawTable(out: Shape[], s: CbState, roles: Roles, x0: number, y0: number): Bounds {
  out.push(text('table-title', x0, y0 + 17, 'requests', { size: TITLE_SIZE, weight: 'bold' }));
  const top = y0 + TITLE + 18;
  const lx = x0 + 26;
  COLS.forEach(([, head], c) =>
    out.push(
      text(`th-${c}`, lx + c * TD_W + TD_W / 2, top - 6, head, {
        size: HEAD_SIZE,
        anchor: 'middle',
        cls: 'label',
      }),
    ),
  );
  s.reqs.forEach((r, k) => {
    const y = top + k * TD_H;
    out.push(
      text(`tr-${r.name}`, lx - 8, y + TD_H / 2 + 5, r.name, {
        anchor: 'end',
        weight: 'bold',
        role: roles.get(`tr-${r.name}`),
      }),
    );
    const vals: Record<(typeof COLS)[number][0], number | null> = {
      arrive: r.arrive,
      prompt: r.prompt,
      out: r.out,
      start: r.start,
      done: r.done,
      wait: wait(r),
    };
    COLS.forEach(([key], c) => {
      const id = `td-${r.name}-${key}`;
      const v = vals[key];
      out.push({
        kind: 'rect',
        id,
        x: lx + c * TD_W,
        y,
        w: TD_W,
        h: TD_H,
        r: 2,
        cls: 'live',
        role: roles.get(id),
      });
      if (v !== null)
        out.push(
          text(`${id}-t`, lx + c * TD_W + TD_W / 2, y + TD_H / 2 + 5, String(v), {
            anchor: 'middle',
          }),
        );
    });
  });
  return { x: x0, y: y0, w: 26 + COLS.length * TD_W, h: TITLE + 18 + MAX_REQS * TD_H };
}

const union = (...bs: Bounds[]): Bounds => {
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...bs.map((b) => b.x + b.w)) - x,
    h: Math.max(...bs.map((b) => b.y + b.h)) - y,
  };
};

export function view(step: Step<CbState, unknown>, settings: CbSettings, stage?: StageSize): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const top = stage && !stage.strip ? ZOOM_CORNER.h : 0;
  const beside = () => {
    const shapes: Shape[] = [];
    const c = drawChart(shapes, s, settings, roles, top);
    const t = drawTable(shapes, s, roles, c.x + c.w + GAP, top);
    return { shapes, bounds: padBounds(union(c, t, { x: 0, y: 0, w: 1, h: 1 }), 12) };
  };
  const under = () => {
    const shapes: Shape[] = [];
    const c = drawChart(shapes, s, settings, roles, top);
    const t = drawTable(shapes, s, roles, 0, c.y + c.h + GAP);
    return { shapes, bounds: padBounds(union(c, t, { x: 0, y: 0, w: 1, h: 1 }), 12) };
  };
  const best = pickLayout(stage, [beside(), under()]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s, settings) };
}
