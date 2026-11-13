/**
 * The transformer block: three parts.
 * - The sentence: the words down the left, and the followed (last) word's attention scores,
 *   then weights, one cell per word it sees.
 * - The stream: the followed word's vector at each stage, one row of cells per stage, top to
 *   bottom. Stream rows (x, x₁, x₂) have bold labels and sit on the skip path drawn down the
 *   left, with a ⊕ where a sublayer adds to it; branch rows (norms, attention, the FFN) have
 *   gray labels. The first four columns are this word's features, the last four the guess
 *   about the next word.
 * - The next word: the six words with the highest logits, their logits and probabilities.
 *
 * A laptop draws the three side by side; a phone puts the stream on top. Shape ids, for marks:
 *   w-<j>, a-<j>          word j's label and attention cell
 *   s-<key>-<c>           a stage's cell (its number is s-<key>-<c>-t), l-<key> its label
 *   w-<word>, lg-<word>, p-<word>   an output row's label, logit cell and probability bar
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import { drawTable, type Column } from '../_decode/bars';
import { short } from '../_lm/numbers';
import { shadeOf } from '../_matrix/matrix';
import { wordName } from '../self-attention/model';
import {
  D,
  describe,
  HEADS,
  OUT_WORDS,
  ranking,
  rowKeys,
  rowLabel,
  rowWidth,
  STREAM_ROWS,
  type BlockExtra,
  type BlockResult,
  type BlockSettings,
  type BlockState,
  type RowKey,
} from './model';

const CELL_W = 48;
const CELL_H = 30;
const PITCH = 34;
const FONT = 15;
const SMALL = 14;
const LABEL_W = 108;
const WORD_W = 66;
const A_W = 54;
const GAP = 28;
const TOP_N = 6;

interface Part {
  shapes: Shape[];
  bounds: Bounds;
}

const maxAbs = (vs: readonly (readonly number[] | undefined)[]) =>
  Math.max(0, ...vs.flatMap((v) => v ?? []).map(Math.abs));

/** The followed word's vector, stage by stage. */
function drawStream(
  set: BlockSettings,
  r: BlockResult | undefined,
  x: readonly number[],
  shown: ReadonlySet<RowKey>,
  roles: ReadonlyMap<string, MarkRole>,
  title: string,
): Part {
  const out: Shape[] = [];
  const keys = rowKeys(set);
  const wide = keys.filter((k) => rowWidth(k) === D);
  const top8 = r ? maxAbs(wide.map((k) => r.rows[k])) : maxAbs([x]);
  const top4 = r ? maxAbs([r.rows.pre, r.rows.up, r.rows.hid]) : 0;
  out.push({
    kind: 'text',
    id: 'st-title',
    x: 0,
    y: 17,
    text: title,
    size: FONT,
    weight: 'bold',
    mono: true,
  });
  const groupY = 44;
  const headY = 64;
  const cells0 = 74;
  for (const [g, text] of ['this word', 'next word'].entries())
    out.push({
      kind: 'text',
      id: `st-g-${g}`,
      x: LABEL_W + (g * 4 + 2) * CELL_W,
      y: groupY,
      text,
      size: SMALL,
      anchor: 'middle',
      cls: 'label',
    });
  out.push({
    kind: 'arrow',
    id: 'st-split',
    x1: LABEL_W + 4 * CELL_W,
    y1: groupY - 14,
    x2: LABEL_W + 4 * CELL_W,
    y2: cells0 + keys.length * PITCH - (PITCH - CELL_H),
    head: 'none',
    dashed: true,
    opacity: 0.5,
  });
  HEADS.forEach((h, c) =>
    out.push({
      kind: 'text',
      id: `st-h-${c}`,
      x: LABEL_W + c * CELL_W + CELL_W / 2,
      y: headY,
      text: h,
      size: SMALL,
      anchor: 'middle',
      mono: true,
      cls: 'label',
    }),
  );
  const rowY = (i: number) => cells0 + i * PITCH;
  const streamIdx = keys.map((k, i) => [k, i] as const).filter(([k]) => STREAM_ROWS.includes(k));
  // The skip path: the stream runs down the left, and each sublayer's output joins it at a ⊕.
  const lane = 16;
  const first = streamIdx[0]![1];
  const lastIdx = streamIdx[streamIdx.length - 1]![1];
  out.push({
    kind: 'arrow',
    id: 'st-skip',
    x1: lane,
    y1: rowY(first) + CELL_H / 2,
    x2: lane,
    y2: rowY(lastIdx) + CELL_H / 2,
    head: 'none',
    opacity: 0.7,
  });
  const joins: RowKey[] = set.order === 'pre' ? ['x1', 'x2'] : ['s1', 's2'];
  for (const [k, i] of streamIdx) {
    const cy = rowY(i) + CELL_H / 2;
    out.push({
      kind: 'arrow',
      id: `st-tick-${k}`,
      x1: lane,
      y1: cy,
      x2: lane + 10,
      y2: cy,
      head: 'none',
      opacity: 0.7,
    });
    if (joins.includes(k)) {
      out.push({
        kind: 'circle',
        id: `st-plus-${k}`,
        x: lane,
        y: cy,
        r: 9,
        role: roles.get(`l-${k}`),
      });
      out.push({
        kind: 'text',
        id: `st-plus-${k}-t`,
        x: lane,
        y: cy + 5,
        text: '+',
        size: FONT,
        anchor: 'middle',
        weight: 'bold',
      });
    }
  }
  keys.forEach((k, i) => {
    const y = rowY(i);
    const isStream = STREAM_ROWS.includes(k);
    out.push({
      kind: 'text',
      id: `l-${k}`,
      x: LABEL_W - 10,
      y: y + CELL_H / 2 + 5,
      text: rowLabel(k, set),
      size: FONT,
      anchor: 'end',
      mono: true,
      weight: isStream ? 'bold' : 'normal',
      cls: isStream ? undefined : 'label',
      role: roles.get(`l-${k}`),
    });
    const w = rowWidth(k);
    const v = k === 'x' ? x : shown.has(k) ? r?.rows[k] : undefined;
    const scale = w === D ? top8 : top4;
    for (let c = 0; c < w; c++) {
      const id = `s-${k}-${c}`;
      const val = v?.[c];
      out.push({
        kind: 'rect',
        id,
        x: LABEL_W + c * CELL_W,
        y,
        w: CELL_W,
        h: CELL_H,
        r: 2,
        cls: val !== undefined ? 'live' : undefined,
        shade: val !== undefined ? shadeOf(val, scale) : undefined,
        role: roles.get(id),
      });
      if (val !== undefined)
        out.push({
          kind: 'text',
          id: `${id}-t`,
          x: LABEL_W + c * CELL_W + CELL_W / 2,
          y: y + CELL_H / 2 + 5,
          text: short(val),
          size: FONT,
          anchor: 'middle',
          mono: true,
        });
    }
  });
  const h = rowY(keys.length - 1) + CELL_H;
  return { shapes: out, bounds: { x: 0, y: 0, w: LABEL_W + D * CELL_W, h } };
}

/** The words and the followed word's attention. */
function drawSentence(
  words: readonly string[],
  r: BlockResult | undefined,
  att: 'none' | 'scores' | 'weights',
  scored: number,
  roles: ReadonlyMap<string, MarkRole>,
  top: number,
): Part {
  const out: Shape[] = [];
  const n = words.length;
  const last = n - 1;
  out.push({
    kind: 'text',
    id: 'a-title',
    x: WORD_W,
    y: 17,
    text: att === 'scores' ? 'score' : 'weight',
    size: FONT,
    weight: 'bold',
    mono: true,
  });

  const scores = r?.att.scaled[last];
  const topScore = scores ? maxAbs([scores]) : 0;
  words.forEach((_, j) => {
    const y = top + j * PITCH;
    out.push({
      kind: 'text',
      id: `w-${j}`,
      x: WORD_W - 10,
      y: y + CELL_H / 2 + 5,
      text: words[j]!,
      size: FONT,
      anchor: 'end',
      weight: 'bold',
      mono: true,
      role: roles.get(`w-${j}`) ?? (j === last ? 'active' : undefined),
    });
    const id = `a-${j}`;
    const val =
      r && att === 'weights'
        ? r.att.a[last]![j]!
        : r && att === 'scores' && j < scored
          ? scores![j]!
          : undefined;
    out.push({
      kind: 'rect',
      id,
      x: WORD_W,
      y,
      w: A_W,
      h: CELL_H,
      r: 2,
      cls: val !== undefined ? 'live' : undefined,
      shade: val !== undefined ? shadeOf(val, att === 'weights' ? 1 : topScore) : undefined,
      role: roles.get(id),
    });
    if (val !== undefined)
      out.push({
        kind: 'text',
        id: `${id}-t`,
        x: WORD_W + A_W / 2,
        y: y + CELL_H / 2 + 5,
        text: short(val),
        size: FONT,
        anchor: 'middle',
        mono: true,
      });
  });
  return {
    shapes: out,
    bounds: { x: 0, y: 0, w: WORD_W + A_W, h: top + n * PITCH - (PITCH - CELL_H) },
  };
}

/** The six words with the highest logits. */
function drawOutput(
  r: BlockResult | undefined,
  out: 'none' | 'logits' | 'probs',
  roles: ReadonlyMap<string, MarkRole>,
): Part {
  const order = r ? ranking(r.logits).slice(0, TOP_N) : [];
  const rows = Array.from({ length: TOP_N }, (_, i) => {
    const w = order[i] !== undefined ? OUT_WORDS[order[i]!]! : `_${i}`;
    return { key: w, label: out === 'none' || order[i] === undefined ? '' : w };
  });
  const cols: Column[] = [
    {
      kind: 'cells',
      id: 'lg',
      title: 'logit',
      w: 56,
      cell: (i) =>
        r && out !== 'none' && order[i] !== undefined
          ? {
              text: short(r.logits[order[i]!]!),
              shade: shadeOf(r.logits[order[i]!]!, maxAbs([r.logits])),
            }
          : null,
    },
    {
      kind: 'bars',
      id: 'p',
      title: 'p',
      track: 150,
      room: 46,
      bar: (i) =>
        r && out === 'probs' && order[i] !== undefined
          ? { value: r.probs[order[i]!]!, text: short(r.probs[order[i]!]!) }
          : null,
    },
  ];
  const t = drawTable([cols], rows, roles, { top: 0, labelW: 76 });
  return t;
}

export function view(
  step: Step<BlockState, BlockExtra>,
  settings: BlockSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const work = extra.work;
  const r = work?.r ?? state.result;
  const shown = new Set<RowKey>(work ? work.shown : r ? rowKeys(settings) : ['x']);
  const att = work ? work.att : r ? 'weights' : 'none';
  const scored = work ? work.scored : r ? state.words.length : 0;
  const outStage = work ? work.out : r ? 'probs' : 'none';
  const last = state.words.length - 1;
  const title = `${wordName(state.words, last)}'s vector`;

  const sentence = drawSentence(state.words, r, att, scored, roles, 74);
  const sentenceTall = drawSentence(state.words, r, att, scored, roles, 32);
  const streamPart = drawStream(settings, r, state.x[last]!, shown, roles, title);
  const output = drawOutput(r, outStage, roles);
  // The output table's own bounds are padded; place it by its padded box.
  const drop = stage?.strip ? 0 : ZOOM_DROP + 12;

  const place = (parts: [Part, number, number][]) => {
    const shapes: Shape[] = [];
    const boxes: Bounds[] = [];
    for (const [p, dx, dy] of parts) {
      shapes.push(...translate(p.shapes, dx, dy));
      boxes.push({ x: p.bounds.x + dx, y: p.bounds.y + dy, w: p.bounds.w, h: p.bounds.h });
    }
    return { shapes, bounds: padBounds(unionBounds(...boxes), 12) };
  };

  const sw = sentence.bounds.w;
  const stw = streamPart.bounds.w;
  const wide = place([
    [sentence, 0, 0],
    [streamPart, sw + GAP, 0],
    [output, sw + GAP + stw + GAP - output.bounds.x, drop + 12 - output.bounds.y],
  ]);
  const belowY = streamPart.bounds.h + GAP;
  const tall = place([
    [streamPart, 0, 0],
    [sentenceTall, 0, belowY],
    [output, sw + GAP - output.bounds.x, belowY - output.bounds.y],
  ]);
  const best = pickLayout(stage, [wide, tall]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(state) };
}
