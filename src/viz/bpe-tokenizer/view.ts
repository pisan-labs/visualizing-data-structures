/**
 * BPE: two pictures.
 *
 * Training: the training words in columns (each its count and its tokens as chips), the table of
 * pairs counted (best first) and the vocabulary (the starting symbols, then one numbered token per
 * merge). On a laptop the three sit side by side; on a phone the pairs and the vocabulary go
 * under the words.
 *
 * Encoding: the word being encoded as chips, the merges in the order learned (the one being tried
 * marked), and the words encoded since training.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { zoomCorner } from '../../render/stage';
import type { Scene, Shape } from '../../render/scene';
import {
  chip,
  chipsW,
  chipW,
  CHIP_GAP,
  CHIP_H,
  drawPairs,
  drawVocab,
  drawWords,
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
import {
  describe,
  KEEP,
  PAIR_ROWS,
  show,
  splitWord,
  vocabSize,
  type BpeExtra,
  type BpeSettings,
  type BpeState,
  type Merge,
} from './model';

/** Room above the last panel for the zoom buttons, when they cover the drawing's corner. */
const DROP = 48;

function wordsPanel(s: BpeState, set: BpeSettings, roles: Map<string, MarkRole>): Panel {
  const widest = Math.max(0, ...s.rows.map((r) => chipsW(splitWord(r.word, set).map(show))));
  return drawWords(s.rows, {
    title: 'training words',
    show: (p) => show(p.t),
    roles,
    chipsWidth: widest,
    perCol: s.rows.length <= 8 ? 8 : Math.ceil(s.rows.length / 2),
  });
}

function pairsPanel(x: BpeExtra, roles: Map<string, MarkRole>, widest: number): Panel {
  const lines = (x.pairs ?? []).map((p) => ({
    a: show(p.a),
    b: show(p.b),
    nums: [String(p.count)],
  }));
  const pairW = Math.max(
    2 * chipW('ab') + 4,
    widest,
    ...lines.map((l) => chipW(l.a) + 4 + chipW(l.b)),
  );
  return drawPairs(lines, {
    title: 'pairs',
    heads: ['count'],
    numW: [textW('count') + 4],
    rows: PAIR_ROWS,
    pairW,
    roles,
    empty: 'not counted',
  });
}

function vocabPanel(s: BpeState, set: BpeSettings, roles: Map<string, MarkRole>): Panel {
  const reserve = Math.max(set.merges, s.merges.length);
  const longest = Math.max(1, ...s.rows.map((r) => splitWord(r.word, set).join('').length));
  const tokenW = Math.max(
    chipW('ab'),
    ...s.merges.map((m) => chipW(show(m.ab))),
    chipW('x'.repeat(Math.min(longest, 8))),
  );
  const bytes = set.base === 'bytes';
  return drawVocab({
    title: `vocabulary: ${vocabSize(s, set)}`,
    base: bytes ? (set.eow ? ['_'] : []) : s.base.map(show),
    baseNote: bytes ? 'all 256 bytes' : undefined,
    added: s.merges.map((m) => show(m.ab)),
    reserve,
    perCol: 10,
    width: 2 * (textW('20') + 6 + tokenW + 14) - 14,
    tokenW,
    roles,
  });
}

// ---------------------------------------------------------------------------------------------
// Encoding

function encodePanel(
  s: BpeState,
  x: BpeExtra,
  set: BpeSettings,
  roles: Map<string, MarkRole>,
): Panel {
  const out: Shape[] = [];
  const enc = x.enc ?? s.encodings.at(-1);
  const word = enc?.word ?? '';
  title(out, 'enc', word ? `encode ${word}` : 'encode');
  // Room for the word split into single symbols, the widest it gets.
  const wide = Math.max(chipsW(splitWord(word, set).map(show)), textW(`encode ${word}`));
  let px = 0;
  for (const p of enc?.pieces ?? []) {
    const id = `e-${p.id}`;
    px += chip(out, id, px, TITLE_H, show(p.t), roles.get(id)) + CHIP_GAP;
  }
  // Earlier words, under the word.
  const y0 = TITLE_H + PITCH + 18;
  label(out, 'done-title', 0, y0 + 17, 'encoded', { bold: true });
  const list = s.encodings;
  const nameW = textW('w'.repeat(Math.max(4, ...list.map((e) => e.word.length)))) + 12;
  let widest = textW('encoded');
  list.forEach((e, j) => {
    const y = y0 + TITLE_H + j * PITCH;
    label(out, `er-${j}`, 0, y + CHIP_H / 2 + 5, e.word, { dim: true });
    let ex = nameW;
    e.pieces.forEach((p, k) => {
      ex +=
        chip(out, `er-${j}-${k}`, ex, y, show(p.t), p.t === '[UNK]' ? 'error' : undefined) +
        CHIP_GAP;
    });
    widest = Math.max(widest, ex);
  });
  if (list.length === 0)
    label(out, 'done-empty', 0, y0 + TITLE_H + CHIP_H / 2 + 5, 'none yet', { dim: true });
  return {
    shapes: out,
    w: Math.max(wide, widest, textW('encoded') + 40),
    h: y0 + TITLE_H + KEEP * PITCH - (PITCH - CHIP_H),
  };
}

function rulesPanel(merges: readonly Merge[], x: BpeExtra, roles: Map<string, MarkRole>): Panel {
  const out: Shape[] = [];
  title(out, 'rules', 'merges, in order');
  const perCol = 10;
  const numW = textW(String(Math.max(9, merges.length))) + 6;
  const pairW = Math.max(
    2 * chipW('ab') + 4,
    ...merges.map((m) => chipW(show(m.a)) + 4 + chipW(show(m.b))),
  );
  const colW = numW + pairW + 18;
  const enc = x.enc;
  const applied = new Set(enc?.applied ?? []);
  merges.forEach((m, i) => {
    const cx = Math.floor(i / perCol) * colW;
    const cy = TITLE_H + (i % perCol) * PITCH;
    const tried = enc && i < enc.rule && !applied.has(i);
    label(out, `mr-${i}-i`, cx + numW - 6, cy + CHIP_H / 2 + 5, String(i + 1), {
      anchor: 'end',
      dim: true,
      role: tried ? 'stale' : undefined,
    });
    const base = enc && applied.has(i) ? 'done' : undefined;
    const wa = chip(out, `mr-${i}-a`, cx + numW, cy, show(m.a), roles.get(`mr-${i}-a`) ?? base);
    chip(out, `mr-${i}-b`, cx + numW + wa + 4, cy, show(m.b), roles.get(`mr-${i}-b`) ?? base);
  });
  if (merges.length === 0)
    label(out, 'rules-empty', 0, TITLE_H + CHIP_H / 2 + 5, 'none learned yet', { dim: true });
  const cols = Math.max(1, Math.ceil(merges.length / perCol));
  return {
    shapes: out,
    w: Math.max(cols * colW - 18, textW('merges, in order'), textW('none learned yet')),
    h: TITLE_H + Math.max(1, Math.min(perCol, merges.length)) * PITCH - (PITCH - CHIP_H),
  };
}

export function view(step: Step<BpeState, BpeExtra>, set: BpeSettings, stage?: StageSize): Scene {
  const s = step.state;
  const x = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const drop = stage && zoomCorner(stage) ? DROP : 0;
  let arrangements;
  if (s.mode === 'encode') {
    const enc = encodePanel(s, x, set, roles);
    const rules = rulesPanel(s.merges, x, roles);
    arrangements = [place(inRow([enc, rules], drop)), place(inRows([[enc], [rules]]))];
  } else {
    const words = wordsPanel(s, set, roles);
    const pairs = pairsPanel(x, roles, 0);
    const vocab = vocabPanel(s, set, roles);
    arrangements = [
      place(inRow([words, pairs, vocab], drop)),
      place(inRows([[words], [pairs, vocab]])),
    ];
  }
  const best = pickLayout(stage, arrangements);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}
