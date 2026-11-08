import type { MarkRole, StageSize, Step } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import {
  ARG_BAND,
  argAndFormula,
  gridWidth,
  indexLabel,
  keySize,
  noteLabel,
  slotGrid,
} from '../hash-open/grid';
import {
  cellId,
  describe,
  freshId,
  type RehashExtra,
  type RehashSettings,
  type RehashState,
  type Table,
} from './model';

const MARGIN = 14;
const MIN_W = 420;
const TITLE = 22;
const GAP = 14;
/**
 * Slots per row. A wide, short stage (a laptop) takes 12, so the old table and the new one
 * (23 slots after 11) fit its height; a phone and the thumbnails keep the usual 8. Decided
 * from the stage alone, so the old table keeps its rows when the new one appears.
 */
const colsFor = (stage?: StageSize): number => (stage && stage.w > 1.6 * stage.h ? 12 : 8);

/**
 * The table, as rows of slots. While a rehash runs, the new table T' sits below the old one
 * and keys slide down into it one at a time.
 */
export function view(
  step: Step<RehashState, RehashExtra>,
  _settings: RehashSettings,
  stage?: StageSize,
): Scene {
  const cols = colsFor(stage);
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const tables = [state.table, ...(state.fresh ? [state.fresh] : [])];
  const W = Math.max(MIN_W, 2 * MARGIN + Math.max(...tables.map((t) => gridWidth(t.m, cols))));
  const shapes: Shape[] = [];
  let y = ARG_BAND;

  const draw = (t: Table, fresh: boolean) => {
    const prefix = fresh ? 'new-' : '';
    const id = fresh ? freshId : cellId;
    const labelId = fresh ? 'fresh-label' : 'table-label';
    shapes.push({
      kind: 'text',
      id: labelId,
      x: (W - gridWidth(t.m, cols)) / 2,
      y: y + 15,
      text: fresh ? `T': the new table, m = ${t.m}` : `T: m = ${t.m}`,
      size: 14,
      mono: true,
      cls: roles.get(labelId) ? undefined : 'label',
      role: roles.get(labelId),
    });
    const g = slotGrid(t.m, (W - gridWidth(t.m, cols)) / 2, y + TITLE, cols);
    const probed =
      (extra.probing ?? 'table') === (fresh ? 'fresh' : 'table') ? extra.probed : undefined;
    for (let j = 0; j < t.m; j++) {
      const box = g.cell(j);
      const cell = t.slots[j] ?? null;
      shapes.push(indexLabel(box, j, prefix));
      shapes.push({
        kind: 'rect',
        id: id(j),
        ...box,
        r: 4,
        cls: cell ? 'cell live' : 'cell',
        role: roles.get(id(j)),
      });
      if (cell) {
        const text = String(cell.key);
        shapes.push({
          kind: 'text',
          id: `v${cell.uid}`,
          x: box.x + box.w / 2,
          y: box.y + box.h / 2 + 7,
          text,
          size: keySize(text),
          anchor: 'middle',
          weight: 'bold',
          role: roles.get(`v${cell.uid}`),
        });
      }
      const is = probed?.[j];
      if (is?.length) shapes.push(noteLabel(box, `${prefix}probe-${j}`, `i=${is.join(',')}`));
    }
    y += TITLE + g.height + GAP;
  };

  draw(state.table, false);
  if (state.fresh) draw(state.fresh, true);

  shapes.push(
    ...argAndFormula(extra.arg, extra.formula, MARGIN, roles.get('arg-box'), (u) => `v${u}`),
  );
  const label = [describe(state), extra.formula ? `${extra.formula}.` : '']
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: { x: 0, y: 0, w: W, h: y - GAP + 6 }, label };
}
