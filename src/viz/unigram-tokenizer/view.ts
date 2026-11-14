/**
 * The unigram tokenizer, in three pictures.
 *
 * After load (and Train): the training words, each split the best way, beside (or under) the
 * vocabulary with every piece's log-probability.
 *
 * Encode: the lattice. The word's letters across the top; under each letter j, best[j] (or the
 * forward sum A[j] when sampling); then every piece of the vocabulary that occurs in the word as
 * a chip under the letters it covers, with its log-probability, single letters first. The split
 * found is the chips marked green. The words encoded so far go under it.
 *
 * Prune: the pieces of two or more letters with their count, log-probability and loss (the
 * cell shaded by the loss), sorted once every loss is known, the removed ones marked; beside it,
 * how the words that used the piece being priced split without it.
 *
 * Shape ids, for marks: lt-<j> a letter, b-<j> best[j], a-<k> lattice arc k (with -t, -p),
 * v-<piece> a vocabulary entry, r-<piece> a row of the loss table, p-<id> a word's piece.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import { short, two } from '../_lm/numbers';
import {
  chip,
  chipsW,
  chipW,
  CHIP_H,
  drawWords,
  FONT,
  inRow,
  inRows,
  label,
  PITCH,
  place,
  textW,
  title,
  TITLE_H,
  type Panel,
} from '../_tokenize/draw';
import type { Piece as WordPiece, Row } from '../_tokenize/pieces';
import {
  arcId,
  cellId,
  describe,
  pieceId,
  rowId,
  type EncWork,
  type PruneWork,
  type UniExtra,
  type UniSettings,
  type UniState,
} from './model';
import { forward, isLetter, lattice, viterbi, type Arc } from './unigram';

const COL = 56;
const LEFT = 52;
const ARC_H = 40;
const ARC_PITCH = 46;
const GAP = 24;
/** Room above the last panel for the zoom buttons, when they cover the drawing's corner. */
const DROP = 48;

type Roles = ReadonlyMap<string, MarkRole>;

/** Panels one under another, `drop` below the top so the zoom buttons cover none of them. */
function stacked(rows: Panel[][], drop: number) {
  const parts = inRows(rows).map((p) => ({ ...p, y: p.y + drop }));
  return place([{ p: { shapes: [], w: 1, h: 1 }, x: 0, y: 0 }, ...parts]);
}

// ---------------------------------------------------------------------------------------------
// The lattice

/** Rows for the arcs: single letters first, then each arc in the first row it fits. */
function arcRows(arcs: readonly Arc[]): number[] {
  const order = arcs
    .map((a, k) => k)
    .sort(
      (i, j) =>
        arcs[i]!.to - arcs[i]!.from - (arcs[j]!.to - arcs[j]!.from) ||
        arcs[i]!.from - arcs[j]!.from,
    );
  const ends: number[] = [];
  const row = Array<number>(arcs.length).fill(0);
  for (const k of order) {
    const a = arcs[k]!;
    let r = 0;
    while (r < ends.length && ends[r]! > a.from) r++;
    ends[r] = a.to;
    row[k] = r;
  }
  return row;
}

function latticePanel(w: EncWork, s: UniState, roles: Roles): Panel {
  const out: Shape[] = [];
  const letters = [...w.word];
  const n = letters.length;
  title(out, 'lat', `lattice of ${w.word}`);
  const yL = TITLE_H;
  const yB = yL + PITCH + 4;
  letters.forEach((c, i) => {
    const id = `lt-${i + 1}`;
    out.push({ kind: 'rect', id, x: LEFT + i * COL, y: yL, w: COL - 4, h: CHIP_H, r: 3 });
    label(out, `${id}-t`, LEFT + i * COL + (COL - 4) / 2, yL + CHIP_H / 2 + 5, c, {
      anchor: 'middle',
      bold: true,
    });
  });
  label(out, 'lat-best', LEFT - 8, yB + CHIP_H / 2 + 5, w.kind === 'best' ? 'best' : 'A', {
    anchor: 'end',
    dim: true,
  });
  w.vals.forEach((v, i) => {
    const id = cellId(i + 1);
    out.push({
      kind: 'rect',
      id,
      x: LEFT + i * COL,
      y: yB,
      w: COL - 4,
      h: CHIP_H,
      r: 3,
      cls: v === null ? 'ghost' : 'live',
      role: roles.get(id),
    });
    if (v !== null)
      label(out, `${id}-t`, LEFT + i * COL + (COL - 4) / 2, yB + CHIP_H / 2 + 5, two(v), {
        anchor: 'middle',
      });
  });
  const rows = arcRows(w.arcs);
  const yA = yB + PITCH + 10;
  label(out, 'lat-pieces', LEFT - 8, yA + 16, 'pieces', { anchor: 'end', dim: true });
  const path = new Set(w.path);
  w.arcs.forEach((a, k) => {
    const id = arcId(k);
    const x = LEFT + a.from * COL;
    const y = yA + rows[k]! * ARC_PITCH;
    const wd = (a.to - a.from) * COL - 4;
    const role = roles.get(id) ?? (path.has(k) ? 'found' : undefined);
    out.push({ kind: 'rect', id, x, y, w: wd, h: ARC_H, r: 4, cls: 'live', role });
    out.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + wd / 2,
      y: y + 16,
      text: a.t,
      size: FONT,
      anchor: 'middle',
      mono: true,
      weight: 'bold',
      role: a.unk ? 'error' : undefined,
    });
    out.push({
      kind: 'text',
      id: `${id}-p`,
      x: x + wd / 2,
      y: y + 34,
      text: two(a.logp),
      size: FONT,
      anchor: 'middle',
      mono: true,
      cls: 'label',
    });
  });
  const depth = Math.max(1, ...rows.map((r) => r + 1));
  let y = yA + depth * ARC_PITCH + 8;
  // The words encoded so far.
  const encs = s.encodings;
  if (encs.length) {
    label(out, 'encs-title', 0, y + 17, 'encoded', { bold: true });
    y += TITLE_H;
    encs.forEach((e, i) => {
      label(
        out,
        `enc-${i}`,
        0,
        y + 17,
        `${e.word} → ${e.pieces.join(' ')}  ${two(e.score)}${e.sampled ? ' (drawn)' : ''}`,
      );
      y += 24;
    });
  }
  const widest = Math.max(
    LEFT + n * COL,
    textW(`lattice of ${w.word}`),
    ...encs.map((e) => textW(`${e.word} → ${e.pieces.join(' ')}  −00.00 (drawn)`)),
  );
  return { shapes: out, w: widest, h: y };
}

/** The lattice an encode step shows, or the last encoding's when the step carries none. */
function encWorkOf(s: UniState, x: UniExtra | undefined, settings: UniSettings): EncWork | null {
  if (x?.enc) return x.enc;
  const e = s.encodings.at(-1);
  if (!e) return null;
  const arcs = lattice(e.word, s.vocab);
  const sum = e.sampled;
  const vals = sum
    ? forward(e.word, s.vocab, Number(settings.alpha) || 1).a.slice(1)
    : viterbi(e.word, s.vocab).best.slice(1);
  const path: number[] = [];
  let from = 0;
  for (const t of e.pieces) {
    const k = arcs.findIndex((a) => a.from === from && a.t === t);
    if (k < 0) break;
    path.push(k);
    from = arcs[k]!.to;
  }
  return { word: e.word, arcs, vals, kind: sum ? 'sum' : 'best', path };
}

// ---------------------------------------------------------------------------------------------
// The vocabulary and the training words

function vocabPanel(s: UniState, roles: Roles): Panel {
  const out: Shape[] = [];
  title(out, 'vocab', `vocabulary: ${s.vocab.pieces.length} pieces, log p`);
  const ls = s.vocab.pieces.filter(isLetter);
  const ms = s.vocab.pieces.filter((p) => !isLetter(p));
  const numW = textW('−0.00');
  const entry = (x: number, y: number, t: string, logp: number, w: number) => {
    const id = pieceId(t);
    chip(out, id, x, y, t, roles.get(id));
    label(out, `${id}-p`, x + w + 6 + numW, y + CHIP_H / 2 + 5, two(logp), {
      anchor: 'end',
      dim: true,
    });
  };
  const letterW = chipW('m');
  const perL = 7;
  const colL = letterW + 6 + numW + 14;
  ls.forEach((p, i) =>
    entry(Math.floor(i / perL) * colL, TITLE_H + (i % perL) * PITCH, p.t, p.logp, letterW),
  );
  const colsL = Math.ceil(ls.length / perL);
  const x0 = colsL * colL + 6;
  const pieceW = Math.max(chipW('ab'), ...ms.map((p) => chipW(p.t)));
  const perM = Math.max(perL, Math.ceil(ms.length / 2));
  const colM = pieceW + 6 + numW + 14;
  ms.forEach((p, i) =>
    entry(x0 + Math.floor(i / perM) * colM, TITLE_H + (i % perM) * PITCH, p.t, p.logp, pieceW),
  );
  const colsM = Math.ceil(ms.length / perM);
  const rows = Math.max(Math.min(ls.length, perL), Math.min(ms.length, perM), 1);
  return {
    shapes: out,
    w: Math.max(
      x0 + colsM * colM - 14,
      textW(`vocabulary: ${s.vocab.pieces.length} pieces, log p`),
    ),
    h: TITLE_H + rows * PITCH - (PITCH - CHIP_H),
  };
}

function wordsPanel(s: UniState, roles: Roles): Panel {
  let id = 0;
  const rows: Row[] = s.words.map(({ word, count }) => ({
    word,
    count,
    pieces: viterbi(word, s.vocab).split.map((a): WordPiece => ({ id: id++, t: a.t })),
  }));
  const widest = Math.max(0, ...rows.map((r) => chipsW(r.pieces.map((p) => p.t))));
  return drawWords(rows, {
    title: 'training words, best splits',
    show: (p) => p.t,
    roles,
    chipsWidth: widest,
    perCol: rows.length <= 8 ? 8 : Math.ceil(rows.length / 2),
  });
}

// ---------------------------------------------------------------------------------------------
// Pruning

function pruneWorkOf(s: UniState, x: UniExtra | undefined): PruneWork {
  if (x?.prune) return x.prune;
  if (s.round) return s.round;
  const rows = s.vocab.pieces
    .filter((p) => !isLetter(p))
    .map(({ t, count, logp }) => ({ t, count, logp }));
  return { rows, loss: new Map(), removed: [], round: s.rounds + 1 };
}

function lossTable(w: PruneWork, roles: Roles, perCol: number): Panel {
  const out: Shape[] = [];
  const removed = new Set(w.removed);
  const head = w.removed.length
    ? `round ${w.round}: remove ${w.removed.length} of ${w.rows.length}`
    : `round ${w.round}: ${w.rows.length} pieces of two or more letters`;
  title(out, 'pr', head);
  const pieceW = Math.max(chipW('abc'), ...w.rows.map((r) => chipW(r.t)));
  const cW = textW('count') + 6;
  const pW = textW('log p') + 12;
  const lW = 62;
  const colW = pieceW + 10 + cW + pW + 10 + lW;
  let most = 1e-9;
  for (const v of w.loss.values()) most = Math.max(most, v);
  const cols = Math.max(1, Math.ceil(w.rows.length / perCol));
  const top = TITLE_H + 22;
  for (let c = 0; c < cols; c++) {
    const x0 = c * (colW + GAP);
    label(out, `ph-${c}-c`, x0 + pieceW + 10 + cW, TITLE_H + 12, 'count', {
      anchor: 'end',
      dim: true,
    });
    label(out, `ph-${c}-p`, x0 + pieceW + 10 + cW + pW, TITLE_H + 12, 'log p', {
      anchor: 'end',
      dim: true,
    });
    label(out, `ph-${c}-l`, x0 + colW - lW / 2, TITLE_H + 12, 'loss', {
      anchor: 'middle',
      dim: true,
    });
  }
  w.rows.forEach((r, i) => {
    const x0 = Math.floor(i / perCol) * (colW + GAP);
    const y = top + (i % perCol) * PITCH;
    const id = rowId(r.t);
    const gone = removed.has(r.t);
    chip(
      out,
      id,
      x0,
      y,
      r.t,
      roles.get(id) ?? (gone ? 'remove' : undefined),
      gone ? 'ghost' : 'live',
    );
    const ty = y + CHIP_H / 2 + 5;
    label(out, `${id}-c`, x0 + pieceW + 10 + cW, ty, String(r.count), { anchor: 'end' });
    label(out, `${id}-p`, x0 + pieceW + 10 + cW + pW, ty, two(r.logp), {
      anchor: 'end',
      dim: true,
    });
    const v = w.loss.get(r.t);
    const lx = x0 + colW - lW;
    out.push({
      kind: 'rect',
      id: `${id}-l`,
      x: lx,
      y,
      w: lW,
      h: CHIP_H,
      r: 2,
      cls: v === undefined ? 'ghost' : 'live',
      shade: v === undefined ? undefined : Math.min(1, v / most),
    });
    if (v !== undefined)
      label(out, `${id}-l-t`, lx + lW / 2, ty, short(v) === '0' ? '0' : two(v), {
        anchor: 'middle',
      });
  });
  const shown = Math.min(Math.max(w.rows.length, 1), perCol);
  return {
    shapes: out,
    w: Math.max(cols * colW + (cols - 1) * GAP, textW(head)),
    h: top + shown * PITCH - (PITCH - CHIP_H),
  };
}

function resplitPanel(s: UniState, w: PruneWork): Panel {
  const out: Shape[] = [];
  const f = w.focus;
  title(out, 'rs', f ? `without ${f.t}` : 'how words split without a piece');
  const lines = f
    ? f.resplits.length
      ? f.resplits.map((r) => {
          const wd = s.words[r.row]!;
          return `${wd.word}${wd.count > 1 ? ` ×${wd.count}` : ''}: ${r.before.join(' ')} → ${r.after.join(' ')}  +${two(r.cost)}`;
        })
      : ['no best split uses it: +0']
    : [];
  const keep = 6;
  lines.slice(0, keep).forEach((t, i) => label(out, `rs-${i}`, 0, TITLE_H + i * 24 + 17, t));
  if (lines.length > keep)
    label(out, 'rs-more', 0, TITLE_H + keep * 24 + 17, `and ${lines.length - keep} more`, {
      dim: true,
    });
  const longest = Math.max(
    textW('how words split without a piece'),
    ...s.words.map((wd) =>
      textW(`${wd.word} ×99: ${[...wd.word].join(' ')} → ${[...wd.word].join(' ')}  +00.00`),
    ),
  );
  return { shapes: out, w: Math.min(longest, 420), h: TITLE_H + (keep + 1) * 24 };
}

// ---------------------------------------------------------------------------------------------

export function view(
  step: Step<UniState, UniExtra>,
  settings: UniSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const label = describe(s);
  const x = step.extra;
  const drop = stage?.strip ? 0 : DROP;
  if (s.mode === 'prune') {
    const w = pruneWorkOf(s, x);
    const rs = resplitPanel(s, w);
    const options = [Math.max(4, Math.ceil(w.rows.length / 2)), Math.max(1, w.rows.length)].flatMap(
      (per) => {
        const t = lossTable(w, roles, per);
        return [place(inRow([t, rs], drop)), stacked([[t], [rs]], drop)];
      },
    );
    const best = pickLayout(stage, options);
    return { shapes: best.shapes, bounds: best.bounds, label };
  }
  if (s.mode === 'encode') {
    const w = encWorkOf(s, x, settings);
    if (w) {
      const lat = latticePanel(w, s, roles);
      const voc = vocabPanel(s, roles);
      const options = [
        place(inRow([lat, voc], drop)),
        stacked([[lat], [voc]], drop),
        stacked([[lat]], drop),
      ];
      // The vocabulary is a reference: leave it out only where the lattice would get too small.
      const narrow = stage && stage.w < 520;
      const best = narrow ? options[2]! : pickLayout(stage, options.slice(0, 2));
      return { shapes: best.shapes, bounds: best.bounds, label };
    }
  }
  const words = wordsPanel(s, roles);
  const voc = vocabPanel(s, roles);
  const best = pickLayout(stage, [
    place(inRow([words, voc], drop)),
    stacked([[words], [voc]], drop),
  ]);
  return { shapes: best.shapes, bounds: best.bounds, label };
}
