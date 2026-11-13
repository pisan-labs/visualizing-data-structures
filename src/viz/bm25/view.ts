/**
 * BM25: the documents (each word drawn on its own, so the query words light up, with the
 * length and the score so far), the inverted index (one row per term in alphabetical order:
 * its document count n, its IDF once a search looks it up, and its postings as chips
 * "d3:2", document and term frequency), and the min-heap of the best three, which becomes the
 * ranked answer. A laptop puts the index beside the documents; a phone stacks them.
 *
 * Shape ids, for marks: d-<doc> a document's row, w-<doc>-<i> its i-th word, ds-<doc> its score
 * cell; t-<term> an index row, p-<term>-<doc> a posting; h-<doc> a box in the heap.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { text } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { short } from '../_lm/numbers';
import { shadeOf } from '../_matrix/matrix';
import {
  dName,
  describe,
  docId,
  heapId,
  K,
  postingId,
  scoreId,
  termId,
  wordId,
  type BmExtra,
  type BmSettings,
  type BmState,
  type Kept,
} from './model';

type Roles = ReadonlyMap<string, MarkRole>;

interface Block {
  shapes: Shape[];
  bounds: Bounds;
}

const SIZE = 13;
const ROW_H = 22;
const CHAR = SIZE * 0.62;
const CHIP_W = 42;
const NODE_W = 62;
const NODE_H = 38;

const textW = (s: string) => s.length * CHAR;

function drawDocs(s: BmState, roles: Roles, scores: Record<number, number> | undefined, query: string[]): Block {
  const shapes: Shape[] = [];
  const wordsW = Math.max(150, ...s.docs.map((d) => d.words.reduce((t, w) => t + textW(w) + 6, 0)));
  const xWords = 30;
  const xLen = xWords + wordsW + 8;
  const xScore = xLen + 30;
  const width = xScore + 50;
  const heads: [string, number, 'start' | 'middle'][] = [
    ['doc', 0, 'start'],
    ['words', xWords, 'start'],
    ['|d|', xLen + 10, 'middle'],
    ['score', xScore + 24, 'middle'],
  ];
  heads.forEach(([h, x, anchor], c) =>
    shapes.push(text(`dh-${c}`, { x, y: 14 }, h, { size: SIZE, bold: true, anchor })),
  );
  const top = 22;
  const vals = Object.values(scores ?? {});
  const scale = Math.max(0, ...vals.map(Math.abs));
  s.docs.forEach((d, r) => {
    const y = top + r * ROW_H;
    const role = roles.get(docId(d.id));
    shapes.push({
      kind: 'rect',
      id: docId(d.id),
      x: 0,
      y,
      w: xScore - 4,
      h: ROW_H,
      r: 2,
      cls: role ? 'live' : 'ghost',
      role,
      opacity: role ? 1 : 0,
    });
    shapes.push(text(`dn-${d.id}`, { x: 2, y: y + 16 }, dName(d.id), { size: SIZE, bold: true, cls: '' }));
    let x = xWords;
    d.words.forEach((w, i) => {
      const id = wordId(d.id, i);
      const hit = query.includes(w);
      shapes.push(
        text(id, { x, y: y + 16 }, w, {
          size: SIZE,
          role: roles.get(id) ?? (hit ? 'found' : undefined),
          bold: hit,
          cls: roles.get(id) || hit ? undefined : '',
        }),
      );
      x += textW(w) + 6;
    });
    shapes.push(
      text(`dl-${d.id}`, { x: xLen + 10, y: y + 16 }, String(d.words.length), { size: SIZE, anchor: 'middle', mono: true }),
    );
    const sc = scores?.[d.id];
    shapes.push({
      kind: 'rect',
      id: scoreId(d.id),
      x: xScore,
      y: y + 1,
      w: 48,
      h: ROW_H - 2,
      r: 2,
      cls: sc === undefined ? 'ghost' : 'live',
      shade: sc === undefined ? undefined : shadeOf(sc, scale),
      role: roles.get(scoreId(d.id)),
      opacity: sc === undefined ? 0.35 : 1,
    });
    shapes.push(
      text(`${scoreId(d.id)}-t`, { x: xScore + 24, y: y + 16 }, sc === undefined ? '' : short(sc), {
        size: SIZE,
        anchor: 'middle',
        mono: true,
        cls: '',
      }),
    );
  });
  return { shapes, bounds: { x: 0, y: 0, w: width, h: top + Math.max(1, s.docs.length) * ROW_H } };
}

function drawIndex(s: BmState, roles: Roles, idf: Record<string, number> | undefined): Block {
  const shapes: Shape[] = [];
  const terms = [...s.index].sort((a, b) => (a.term < b.term ? -1 : 1));
  const termW = Math.max(46, ...terms.map((t) => textW(t.term) + 8));
  const xN = termW + 4;
  const xIdf = xN + 26;
  const xList = xIdf + 44;
  const most = Math.max(1, ...terms.map((t) => t.postings.length));
  const width = xList + most * (CHIP_W + 4);
  const heads: [string, number, 'start' | 'middle'][] = [
    ['term', 0, 'start'],
    ['n', xN + 8, 'middle'],
    ['IDF', xIdf + 20, 'middle'],
    ['postings (doc:tf)', xList, 'start'],
  ];
  heads.forEach(([h, x, anchor], c) =>
    shapes.push(text(`ih-${c}`, { x, y: 14 }, h, { size: SIZE, bold: true, anchor })),
  );
  const top = 22;
  terms.forEach((t, r) => {
    const y = top + r * ROW_H;
    const id = termId(t.term);
    const role = roles.get(id);
    shapes.push({
      kind: 'rect',
      id,
      x: 0,
      y,
      w: xList - 4,
      h: ROW_H,
      r: 2,
      cls: role ? 'live' : 'ghost',
      role,
      opacity: role ? 1 : 0,
    });
    shapes.push(text(`${id}-n`, { x: 4, y: y + 16 }, t.term, { size: SIZE, bold: true, cls: '' }));
    shapes.push(
      text(`${id}-df`, { x: xN + 8, y: y + 16 }, String(t.postings.length), { size: SIZE, anchor: 'middle', mono: true }),
    );
    const w = idf?.[t.term];
    shapes.push(
      text(`${id}-idf`, { x: xIdf + 20, y: y + 16 }, w === undefined ? '' : short(w), {
        size: SIZE,
        anchor: 'middle',
        mono: true,
        cls: '',
      }),
    );
    t.postings.forEach((p, k) => {
      const pid = postingId(t.term, p.doc);
      const x = xList + k * (CHIP_W + 4);
      shapes.push({ kind: 'rect', id: pid, x, y: y + 2, w: CHIP_W, h: ROW_H - 4, r: 3, cls: 'live', role: roles.get(pid) });
      shapes.push(
        text(`${pid}-t`, { x: x + CHIP_W / 2, y: y + 16 }, `${dName(p.doc)}:${p.tf}`, {
          size: SIZE,
          anchor: 'middle',
          mono: true,
          cls: '',
        }),
      );
    });
  });
  return { shapes, bounds: { x: 0, y: 0, w: width, h: top + Math.max(1, terms.length) * ROW_H } };
}

function node(shapes: Shape[], e: Kept, cx: number, y: number, roles: Roles) {
  const id = heapId(e.doc);
  shapes.push({ kind: 'rect', id, x: cx - NODE_W / 2, y, w: NODE_W, h: NODE_H, r: 4, cls: 'live', role: roles.get(id) });
  shapes.push(text(`${id}-d`, { x: cx, y: y + 16 }, dName(e.doc), { size: SIZE, bold: true, anchor: 'middle', cls: '' }));
  shapes.push(text(`${id}-s`, { x: cx, y: y + 32 }, short(e.score), { size: SIZE, anchor: 'middle', mono: true }));
}

function drawHeap(s: BmState, roles: Roles, extra: BmExtra): Block {
  const shapes: Shape[] = [];
  const top = 24;
  const W = 3 * (NODE_W + 10);
  if (extra.heap) {
    shapes.push(text('hh', { x: 0, y: 14 }, `best ${K} so far (min-heap)`, { size: SIZE, bold: true }));
    const at = (p: number) => (p === 0 ? { x: W / 2, y: top } : { x: p === 1 ? W / 4 : (3 * W) / 4, y: top + 54 });
    extra.heap.forEach((e, p) => {
      const c = at(p);
      if (p > 0) {
        const r = at(0);
        shapes.push({ kind: 'arrow', id: `he-${p}`, x1: r.x, y1: r.y + NODE_H, x2: c.x, y2: c.y, head: 'none', opacity: 0.6 });
      }
      node(shapes, e, c.x, c.y, roles);
    });
  } else if (s.last) {
    shapes.push(
      text('hh', { x: 0, y: 14 }, s.last.top.length ? `top ${s.last.top.length}, best first` : 'no matches', {
        size: SIZE,
        bold: true,
      }),
    );
    s.last.top.forEach((e, r) => {
      const cx = NODE_W / 2 + r * (NODE_W + 10);
      node(shapes, e, cx, top, roles);
      shapes.push(text(`hr-${r}`, { x: cx, y: top + NODE_H + 16 }, String(r + 1), { size: SIZE, anchor: 'middle' }));
    });
  }
  return { shapes, bounds: { x: 0, y: 0, w: W, h: top + 54 + NODE_H + 4 } };
}

export function view(step: Step<BmState, BmExtra>, _settings: BmSettings, stage?: StageSize): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const searching = extra.query !== undefined;
  const scores = searching ? extra.scores : s.last?.scores;
  const idf = searching ? extra.idf : s.last?.idf;
  const query = (searching ? extra.query : s.last?.query) ?? [];
  const docs = drawDocs(s, roles, scores, query);
  const index = drawIndex(s, roles, idf);
  const heap = drawHeap(s, roles, extra);

  const compose = (parts: [Block, number, number][]): Block => {
    const shapes = parts.flatMap(([b, dx, dy]) => translate(b.shapes, dx, dy));
    const x2 = Math.max(...parts.map(([b, dx]) => dx + b.bounds.w));
    const y2 = Math.max(...parts.map(([b, , dy]) => dy + b.bounds.h));
    return { shapes, bounds: { x: -10, y: -10, w: x2 + 20, h: y2 + 20 } };
  };
  const gap = 20;
  const beside = compose([
    [docs, 0, 0],
    [heap, 0, docs.bounds.h + gap],
    [index, docs.bounds.w + 28, 0],
  ]);
  const stacked = compose([
    [docs, 0, 0],
    [index, 0, docs.bounds.h + gap],
    [heap, 0, docs.bounds.h + index.bounds.h + 2 * gap],
  ]);
  const best = pickLayout(stage, [beside, stacked]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}
