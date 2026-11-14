import type { StageSize, Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { describeRows, rowsScene } from '../_threads3/page';
import {
  damaged,
  macro,
  node,
  programOf,
  spec,
  stack,
  taken,
  type CasSettings,
  type CasState,
} from './model';

/** The stack panel's lines: the stack from top, and what each thread has popped. */
export function stackRows(s: CasState, settings: CasSettings) {
  const mac = macro(settings);
  const on = stack(s.m);
  const { t1, t2 } = taken(mac, s.m);
  const has = (xs: number[]) => (xs.length ? xs.map(node).join(', ') : 'nothing');
  const bad = damaged(mac, s.m);
  return [
    { key: 'list', text: on.length ? `top → ${on.map(node).join(' → ')}` : 'top → empty' },
    { key: 't1', text: `T1 has ${has(t1)}` },
    { key: 't2', text: `T2 has ${has(t2)}` },
    { key: 'aba', text: bad.length ? `${bad.map(node).join(', ')}: twice!` : '' },
  ];
}

export function describe(s: CasState, settings: CasSettings): string {
  const base = describeRows(spec, s, settings);
  if (programOf(settings) !== 'aba') return base;
  const rows = stackRows(s, settings).filter((r) => r.text);
  return `${base} ${rows.map((r) => r.text).join('. ')}.`;
}

export function view(step: Step<CasState>, settings: CasSettings, stage?: StageSize): Scene {
  const aba = programOf(settings) === 'aba';
  return rowsScene(spec, step, settings, stage, {
    panels: aba
      ? [
          {
            id: 'stack',
            title: 'the stack',
            rows: stackRows(step.state, settings).filter((r) => r.text),
            room: 4,
            chars: 15,
          },
        ]
      : undefined,
    label: describe(step.state, settings),
  });
}
