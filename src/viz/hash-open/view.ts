import type { MarkRole, Step } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import { ARG_BAND, argAndFormula, indexLabel, keySize, noteLabel, slotGrid } from './grid';
import { cellId, describe, type OpenExtra, type OpenSettings, type OpenState } from './model';

const MARGIN = 14;
const MIN_W = 420;
/** Band across the top for the key and the probe formula. */
const TOP = ARG_BAND;

export function view(step: Step<OpenState, OpenExtra>, _settings: OpenSettings): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const probe = slotGrid(state.m, 0, 0);
  const W = Math.max(MIN_W, 2 * MARGIN + probe.width);
  const g = slotGrid(state.m, (W - probe.width) / 2, TOP);
  const shapes: Shape[] = [];

  for (let j = 0; j < state.m; j++) {
    const box = g.cell(j);
    const cell = state.slots[j] ?? null;
    const id = cellId(j);
    shapes.push(indexLabel(box, j));
    shapes.push({
      kind: 'rect',
      id,
      ...box,
      r: 4,
      cls: cell && !cell.del ? 'cell live' : 'cell',
      role: roles.get(id) ?? (extra.reuse === j ? 'visit' : undefined),
    });
    if (cell) {
      const text = cell.del ? 'DEL' : String(cell.key);
      shapes.push({
        kind: 'text',
        id: `v${cell.uid}`,
        x: box.x + box.w / 2,
        y: box.y + box.h / 2 + (cell.del ? 5 : 7),
        text,
        size: cell.del ? 14 : keySize(text),
        anchor: 'middle',
        weight: cell.del ? 'normal' : 'bold',
        mono: cell.del,
        role: cell.del ? 'stale' : roles.get(`v${cell.uid}`),
      });
    }
    const is = extra.probed?.[j];
    if (is?.length) {
      const reuse = extra.reuse === j ? ' d' : '';
      shapes.push(noteLabel(box, `probe-${j}`, `i=${is.join(',')}${reuse}`));
    }
  }

  shapes.push(
    ...argAndFormula(extra.arg, extra.formula, MARGIN, roles.get('arg-box'), (u) => `v${u}`),
  );

  const label = [describe(state), extra.formula ? `${extra.formula}.` : '']
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: { x: 0, y: 0, w: W, h: TOP + g.height + 6 }, label };
}
