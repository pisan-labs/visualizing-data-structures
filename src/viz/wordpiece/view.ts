/**
 * WordPiece: two pictures.
 *
 * Training: the training words (each its count and its pieces; every piece after the first is a
 * ## piece, drawn without the ##), the pairs ranked by score with what the score is made of (and
 * the pair BPE would take, set apart), and the vocabulary.
 *
 * Encoding: the word as letter cells, the pieces taken so far, and the trie being walked (pieces
 * that start a word, or ## pieces): the path in color, rings on nodes that end a piece. With the
 * trie setting off, the vocabulary and the substring being looked up instead. Then the words
 * encoded since training.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { drawTrie, layoutTrie, RING } from '../../layouts/trie';
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
  FONT,
  type Panel,
} from '../_tokenize/draw';
import {
  buildTries,
  CONT,
  describe,
  KEEP,
  PAIR_ROWS,
  score3,
  UNK,
  vocabulary,
  type Tries,
  type WpEnc,
  type WpExtra,
  type WpSettings,
  type WpState,
} from './model';

const DROP = 48;
const R = 10;
const CELL = 24;

const bare = (t: string) => (t.startsWith(CONT) ? t.slice(CONT.length) : t);

function wordsPanel(s: WpState, roles: Map<string, MarkRole>, cols: number): Panel {
  const widest = Math.max(0, ...s.rows.map((r) => chipsW([...r.word])));
  return drawWords(s.rows, {
    title: 'training words',
    show: (p) => bare(p.t),
    roles,
    chipsWidth: widest,
    perCol: s.rows.length <= 8 ? 8 : Math.ceil(s.rows.length / cols),
  });
}

function pairsPanel(x: WpExtra, roles: Map<string, MarkRole>): Panel {
  const rows = x.pairs ?? [];
  const lines = rows.map((p) => ({
    a: p.a,
    b: p.b,
    nums: [String(p.count), String(p.ca), String(p.cb), score3(p.score)],
    role: p.bpe ? ('compare' as const) : undefined,
  }));
  const split = rows.findIndex((p) => p.bpe);
  const pairW = Math.max(
    chipW('##lk') + 4 + chipW('##i'),
    ...lines.map((l) => chipW(l.a) + 4 + chipW(l.b)),
  );
  return drawPairs(lines, {
    title: 'pairs, by score',
    heads: ['ab', 'a', 'b', 'score'],
    numW: [textW('999') + 10, textW('999') + 10, textW('999') + 10, textW('score') + 8],
    rows: PAIR_ROWS + 1,
    pairW,
    roles,
    empty: 'not scored',
    splitAt: split >= 0 ? split : PAIR_ROWS,
    splitLabel: 'BPE’s pick, the most frequent:',
  });
}

function vocabPanel(
  s: WpState,
  set: WpSettings,
  roles: Map<string, MarkRole>,
  perCol: number,
  found?: string,
): Panel {
  const reserve = Math.max(set.merges, s.merges.length);
  const longest = Math.max(1, ...s.rows.map((r) => r.word.length + 2));
  const tokenW = Math.max(
    chipW('##ab'),
    ...s.merges.map((m) => chipW(m.ab)),
    chipW('x'.repeat(Math.min(longest, 8))),
  );
  const cols = Math.max(1, Math.ceil(reserve / perCol));
  const r = new Map(roles);
  if (found !== undefined) {
    const j = s.alphabet.indexOf(found);
    if (j >= 0) r.set(`vb-${j}`, 'found');
    const i = s.merges.findIndex((m) => m.ab === found);
    if (j < 0 && i >= 0) r.set(`vm-${i}`, 'found');
  }
  return drawVocab({
    title: `vocabulary: ${vocabulary(s).length}`,
    base: s.alphabet,
    added: s.merges.map((m) => m.ab),
    reserve,
    perCol,
    width: Math.max(cols * (textW(String(reserve)) + 6 + tokenW + 14) - 14, 6 * chipW('##a')),
    tokenW,
    roles: r,
  });
}

// ---------------------------------------------------------------------------------------------
// Encoding

/** The word as letter cells (wl-<i>), then the pieces taken (pc-<i>, or enc-unk). */
function wordPanel(enc: WpEnc | undefined, roles: Map<string, MarkRole>): Panel {
  const out: Shape[] = [];
  const word = enc?.word ?? '';
  const chars = [...word];
  title(out, 'enc', word ? `encode ${word}` : 'encode');
  // Which piece each letter went into, for the role of a letter cell.
  chars.forEach((c, i) => {
    let role: MarkRole | undefined;
    if (enc && !enc.done) {
      if (i < enc.start) role = 'done';
      else if (i < enc.last) role = 'found';
      else if (i < enc.at) role = 'active';
    } else if (enc?.done) role = enc.unk ? undefined : 'done';
    const id = `wl-${i}`;
    out.push({
      kind: 'rect',
      id,
      x: i * CELL,
      y: TITLE_H,
      w: CELL - 2,
      h: CHIP_H,
      r: 3,
      cls: 'live',
      role: roles.get(id) ?? role,
    });
    out.push({
      kind: 'text',
      id: `${id}-t`,
      x: i * CELL + (CELL - 2) / 2,
      y: TITLE_H + CHIP_H / 2 + 5,
      text: c,
      size: FONT,
      anchor: 'middle',
      mono: true,
    });
  });
  const py = TITLE_H + PITCH + 10;
  label(out, 'pieces-label', 0, py + CHIP_H / 2 + 5, '→', { dim: true });
  const x0 = textW('→') + 10;
  if (enc?.unk) chip(out, 'enc-unk', x0, py, UNK, roles.get('enc-unk') ?? 'error');
  else {
    let x = x0;
    (enc?.pieces ?? []).forEach((p, i) => {
      x += chip(out, `pc-${i}`, x, py, p, roles.get(`pc-${i}`)) + CHIP_GAP;
    });
  }
  // Room for the most pieces the word can have: one per letter.
  const most = chars.map((c, i) => (i ? CONT + c : c));
  return {
    shapes: out,
    w: Math.max(chars.length * CELL, x0 + chipsW(most), textW(`encode ${word}`)),
    h: py + CHIP_H,
  };
}

function encodedPanel(s: WpState): Panel {
  const out: Shape[] = [];
  title(out, 'done', 'encoded');
  const nameW = textW('w'.repeat(Math.max(4, ...s.encodings.map((e) => e.word.length)))) + 12;
  let widest = textW('encoded');
  s.encodings.forEach((e, j) => {
    const y = TITLE_H + j * PITCH;
    label(out, `er-${j}`, 0, y + CHIP_H / 2 + 5, e.word, { dim: true });
    let x = nameW;
    e.pieces.forEach((p, k) => {
      x += chip(out, `er-${j}-${k}`, x, y, p, p === UNK ? 'error' : undefined) + CHIP_GAP;
    });
    widest = Math.max(widest, x);
  });
  if (s.encodings.length === 0)
    label(out, 'done-empty', 0, TITLE_H + CHIP_H / 2 + 5, 'none yet', { dim: true });
  return { shapes: out, w: widest, h: TITLE_H + KEEP * PITCH - (PITCH - CHIP_H) };
}

function triePanel(
  t: Tries,
  enc: WpEnc | undefined,
  roles: Map<string, MarkRole>,
  sideways: boolean,
): Panel {
  const inner = !!enc && enc.start > 0 && !enc.done;
  const opts = () => ({
    label: (u: number) => t.nodes[u]!.ch,
    halfWidth: (u: number) => (t.nodes[u]!.piece !== null ? R + RING : R),
    radius: R,
    labelSize: FONT,
    gap: sideways ? 5 : 10,
    labelGap: 8,
    levelGap: 54,
    sideways,
  });
  const kids = (u: number) => t.nodes[u]!.kids;
  const both = [t.start, t.inner].map((root) => layoutTrie(root, kids, opts()));
  const layout = both[inner ? 1 : 0]!;
  const path = new Set(enc && !enc.done ? enc.path : []);
  const shapes = drawTrie(layout, {
    isEnd: (u) => t.nodes[u]!.piece !== null,
    roles,
    baseRole: (u) => (path.has(u) ? 'visit' : undefined),
    edgeRole: (u) => (path.has(u) ? 'active' : undefined),
  });
  const out: Shape[] = [];
  const head = inner ? 'trie of ## pieces' : 'trie of pieces that start a word';
  title(out, 'trie', head);
  // Both tries get the same room, so the picture keeps its frame when the walk switches.
  const w = Math.max(...both.map((l) => l.bounds.w), textW('trie of pieces that start a word'));
  const h = Math.max(...both.map((l) => l.bounds.h));
  const pad = textW('start') + R + 8;
  const dx = -layout.bounds.x + (sideways ? pad : (w - layout.bounds.w) / 2);
  const dy = TITLE_H + 14 - layout.bounds.y;
  out.push(...translate(shapes, dx, dy));
  const root = layout.nodes.get(inner ? t.inner : t.start)!;
  // Left of the root and above its center line, clear of the edges, which leave it downward
  // (or to the right).
  out.push({
    kind: 'text',
    id: 'root-label',
    x: root.x + dx - R - 6,
    y: root.y + dy - (sideways ? R + 4 : 3),
    text: inner ? '##' : 'start',
    size: FONT,
    anchor: 'end',
    mono: true,
    cls: 'label',
  });
  return { shapes: out, w: w + (sideways ? pad : 0), h: TITLE_H + 14 + h };
}

/** BERT's loop: the substring looked up (cand), and the vocabulary it is looked up in. */
function lookupPanel(
  s: WpState,
  set: WpSettings,
  enc: WpEnc | undefined,
  roles: Map<string, MarkRole>,
  perCol: number,
): Panel {
  const out: Shape[] = [];
  label(out, 'cand-label', 0, CHIP_H / 2 + 5, 'look up', { dim: true });
  const x0 = textW('look up') + 10;
  if (enc?.candidate !== undefined)
    chip(out, 'cand', x0, 0, enc.candidate, roles.get('cand') ?? (enc.hit ? 'found' : undefined));
  const v = vocabPanel(s, set, roles, perCol, enc?.hit ? enc.candidate : undefined);
  const longest = Math.max(
    0,
    ...[...(enc?.word ?? '')].map((_, i, a) => chipW(CONT + a.slice(i).join(''))),
  );
  out.push(...translate(v.shapes, 0, PITCH + 10));
  return { shapes: out, w: Math.max(v.w, x0 + longest), h: PITCH + 10 + v.h };
}

export function view(step: Step<WpState, WpExtra>, set: WpSettings, stage?: StageSize): Scene {
  const s = step.state;
  const x = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const drop = stage && zoomCorner(stage) ? DROP : 0;
  let arrangements;
  if (s.mode === 'encode') {
    const enc = x.enc ?? lastEnc(s);
    const word = wordPanel(enc, roles);
    const done = encodedPanel(s);
    if (set.trie) {
      const t = buildTries(vocabulary(s));
      const flat = triePanel(t, enc, roles, false);
      const side = triePanel(t, enc, roles, true);
      arrangements = [
        place(inRows([[word, done], [flat]])),
        place(inRows([[word, done], [side]])),
        place(inRow([stack(word, done), flat], drop)),
      ];
    } else {
      const look = (n: number) => lookupPanel(s, set, enc, roles, n);
      arrangements = [
        place(inRow([stack(word, done), look(5)], drop)),
        place(inRows([[word, done], [look(5)]])),
        place(inRows([[word], [look(10)], [done]])),
      ];
    }
  } else {
    const pairs = pairsPanel(x, roles);
    arrangements = [
      place(inRow([wordsPanel(s, roles, 2), pairs, vocabPanel(s, set, roles, 7)], drop)),
      place(inRows([[wordsPanel(s, roles, 3)], [pairs, vocabPanel(s, set, roles, 10)]])),
      place(inRows([[wordsPanel(s, roles, 2)], [pairs, vocabPanel(s, set, roles, 10)]])),
    ];
  }
  const best = pickLayout(stage, arrangements);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}

/** The last word encoded, as a finished walk (for a picture with no step data). */
function lastEnc(s: WpState): WpEnc | undefined {
  const e = s.encodings.at(-1);
  if (!e) return undefined;
  const n = [...e.word].length;
  return {
    word: e.word,
    pieces: e.pieces,
    start: n,
    at: n,
    last: n,
    path: [],
    unk: e.pieces[0] === UNK,
    done: true,
  };
}

/** Two panels, one under the other, as one panel. */
function stack(a: Panel, b: Panel): Panel {
  const gap = 24;
  return {
    shapes: [...a.shapes, ...translate(b.shapes, 0, a.h + gap)],
    w: Math.max(a.w, b.w),
    h: a.h + gap + b.h,
  };
}
