import type { MarkRole, StageSize, Step } from '../../engine/types';
import { drawLanes, type PanelRow } from '../../layouts/lanes';
import type { Scene } from '../../render/scene';
import { describeMachine, lanesInput } from '../_threads/page';
import {
  expected,
  program,
  totalSteps,
  type RaceSettings,
  type RaceState,
  type Tally,
} from './model';

/** The tally panel's lines: one per final count (keyed by it), then the total. */
export function tallyRows(t: Tally, expect: number): PanelRow[] {
  const n = (x: number) => x.toLocaleString('en-US');
  const width = n(t.total).length;
  const rows = t.rows.map((r) => ({
    key: `c${r.count}`,
    text: `count = ${r.count}: ${n(r.schedules).padStart(width)}${r.count === expect ? '  ok' : '  lost'}`,
  }));
  const of = `of ${n(t.total)} ${t.total === 1 ? 'schedule' : 'schedules'}`;
  return [...rows, { key: 'total', text: of }];
}

export function describe(s: RaceState, settings: RaceSettings): string {
  const p = program(settings);
  const base = describeMachine(p, s.m);
  if (!s.tally || !s.tally.rows.length) return base;
  const rows = s.tally.rows.map((r) => `${r.schedules} end with count = ${r.count}`).join(', ');
  return `${base} Every interleaving so far: ${rows}, of ${s.tally.total} schedules.`;
}

export function view(step: Step<RaceState>, settings: RaceSettings, stage?: StageSize): Scene {
  const p = program(settings);
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const e = expected(p);
  // Room for every count the finished tally shows, and the total.
  const panels = s.tally
    ? [
        {
          id: 'every',
          title: s.tally.from ? 'every interleaving from here' : 'every interleaving',
          rows: tallyRows(s.tally, e),
          room: s.tally.size + 1,
          chars: `count = ${e}: ${s.tally.total.toLocaleString('en-US')}  lost`.length,
        },
      ]
    : undefined;
  const { shapes, bounds } = drawLanes(lanesInput(p, s.m, { panels }), {
    roles,
    stage,
    room: totalSteps(p),
  });
  return { shapes, bounds, label: describe(s, settings) };
}
