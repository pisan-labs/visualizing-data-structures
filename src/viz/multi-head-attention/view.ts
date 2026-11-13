/**
 * Multi-head attention: the words down the left, then Q (four numbers per word, its columns cut
 * into heads), K and V (as wide as the key/value heads: narrower under GQA and MQA), the
 * attention table of the head on show, and Z, the heads' outputs side by side, which becomes O
 * after the output projection. Cells are shaded by value and always show the number; with more
 * than one head, each column's outline takes the color of its key/value head, so the query heads
 * that share one read the same color. A laptop draws one row of panels; a phone stacks them.
 */
import { groupRole, type MarkRole, type Step, type StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene } from '../../render/scene';
import { short } from '../_lm/numbers';
import { drawPanelRows, shadeOf, type CellLook, type Panel } from '../_matrix/matrix';
import {
  config,
  D_MODEL,
  describe,
  groupOf,
  projectAll,
  weights,
  type CellKind,
  type Config,
  type HeadResult,
  type MhaExtra,
  type MhaSettings,
  type MhaState,
  type Projection,
} from './model';

const NUM_W = 40;
const A_CELL = 46;

const maxAbs = (m: readonly (readonly number[])[]) =>
  Math.max(0, ...m.flat().filter(Number.isFinite).map(Math.abs));

function numberPanel(
  id: string,
  title: string,
  m: number[][] | undefined,
  n: number,
  cols: number,
  heads: readonly string[],
  shown: (c: number) => boolean = () => true,
): Panel {
  const top = m ? maxAbs(m) : 0;
  return {
    id,
    title,
    rows: n,
    cols,
    cellW: NUM_W,
    colHeads: heads,
    cell: (r, c) =>
      m && shown(c) ? { text: short(m[r]![c]!), shade: shadeOf(m[r]![c]!, top) } : null,
  };
}

function attentionPanel(
  words: readonly string[],
  hd: HeadResult | undefined,
  cells: readonly (readonly (CellKind | null)[])[] | undefined,
  title: string,
): Panel {
  const n = words.length;
  const top = {
    raw: hd ? maxAbs(hd.raw) : 0,
    scaled: hd ? maxAbs(hd.s) : 0,
    weight: 1,
  };
  return {
    id: 'a',
    title,
    rows: n,
    cols: n,
    cellW: A_CELL,
    colHeads: words,
    cell(i, j): CellLook | null {
      const kind = cells?.[i]?.[j] ?? null;
      if (!hd || !kind) return null;
      if (j > i && kind === 'scaled') return { text: '−∞', cls: 'ghost', dim: true };
      if (j > i && kind === 'weight') return { text: '0', cls: 'ghost', dim: true };
      const v = kind === 'raw' ? hd.raw[i]![j]! : kind === 'scaled' ? hd.s[i]![j]! : hd.a[i]![j]!;
      return { text: short(v), shade: shadeOf(v, top[kind]) };
    },
  };
}

/** Each column's head, 1-based, as column headers. */
const headsOf = (cols: number, d: number) =>
  Array.from({ length: cols }, (_, c) => String(Math.floor(c / d) + 1));

/** Outline colors by key/value head, under the step's marks. */
function groupRoles(cfg: Config, n: number, roles: Map<string, MarkRole>): void {
  if (cfg.h === 1) return;
  const set = (id: string, g: number) => {
    if (!roles.has(id)) roles.set(id, groupRole(g + 1));
  };
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < D_MODEL; c++) {
      const g = groupOf(cfg, Math.floor(c / cfg.d));
      set(`q-${r}-${c}`, g);
      set(`z-${r}-${c}`, g);
    }
    for (let c = 0; c < cfg.hkv * cfg.d; c++) {
      set(`k-${r}-${c}`, Math.floor(c / cfg.d));
      set(`v-${r}-${c}`, Math.floor(c / cfg.d));
    }
  }
}

export function view(
  step: Step<MhaState, MhaExtra>,
  settings: MhaSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const cfg = config(settings);
  const n = state.words.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const marked = new Set(roles.keys());
  groupRoles(cfg, n, roles);
  const work = extra.work;
  const r = work?.r ?? state.result;

  // What Q, K and V show.
  let p: Projection | undefined = work?.r ?? state.proj;
  let qkv = work ? work.qkv : state.proj ? 3 : 0;
  if (extra.qkv !== undefined) {
    p = projectAll(state.x, weights(cfg));
    qkv = extra.qkv;
  }
  const kw = cfg.hkv * cfg.d;

  // The attention table: the head being worked on, or the last head once done.
  const done = !work && state.result;
  const head = work ? work.head : cfg.h - 1;
  const cells =
    work?.cells ??
    (done ? Array.from({ length: n }, () => Array<CellKind>(n).fill('weight')) : undefined);
  const hd = r?.heads[head];
  const aTitle = r ? `head ${head + 1}` : 'A';

  // Z fills head by head, then turns into O.
  const out = work ? work.out : Boolean(done);
  const zHeads = work ? work.zHeads : done ? cfg.h : 0;
  const zShown = (c: number) => Math.floor(c / cfg.d) < zHeads;

  const q = numberPanel('q', 'q', qkv >= 1 ? p?.q : undefined, n, D_MODEL, headsOf(D_MODEL, cfg.d));
  const k = numberPanel('k', 'k', qkv >= 2 ? p?.k : undefined, n, kw, headsOf(kw, cfg.d));
  const v = numberPanel('v', 'v', qkv >= 3 ? p?.v : undefined, n, kw, headsOf(kw, cfg.d));
  const a = attentionPanel(state.words, hd, cells, aTitle);
  const z = out
    ? numberPanel('z', 'o = z·W_O', r?.o, n, D_MODEL, ['1', '2', '3', '4'])
    : numberPanel(
        'z',
        'z',
        zHeads > 0 ? r?.z : undefined,
        n,
        D_MODEL,
        headsOf(D_MODEL, cfg.d),
        zShown,
      );

  // Group outlines only on cells that show a number; empty cells stay plain.
  const look = new Map<string, MarkRole>();
  for (const [id, role] of roles) {
    if (marked.has(id)) {
      look.set(id, role);
      continue;
    }
    const [m, rr, cc] = id.split('-');
    const panel = { q, k, v, z }[m as 'q' | 'k' | 'v' | 'z'];
    if (panel?.cell(Number(rr), Number(cc)) && !(m === 'z' && out)) look.set(id, role);
  }

  const arrangements = [
    [[q, k, v, a, z]],
    [[q, k], [v, z], [a]],
    [
      [q, k, v],
      [a, z],
    ],
  ].map((groups) => drawPanelRows(groups, state.words, look, stage));
  const best = pickLayout(stage, arrangements);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(state) };
}
