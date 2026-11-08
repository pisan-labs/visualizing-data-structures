/**
 * The trie of patterns (src/layouts/trie.ts), each node that ends a pattern ringed and labeled
 * with it (with output sets, the whole set); failure links as dashed curves (links to the root
 * are left out unless a step uses one) and output links as colored dashed curves. During a scan
 * the text sits above the trie, and the matches found so far beside or under it, with a legend.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest, translate } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/binary-tree';
import { drawTrie, layoutTrie, RING, trieLabelWidth } from '../../layouts/trie';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  describe,
  dictId,
  failId,
  linksOf,
  matchId,
  refMatches,
  ROOT,
  textId,
  type AcExtra,
  type AcSettings,
  type AcState,
} from './model';

const R = 12;
const WORD = 14;
const CW = 28;

export function view(step: Step<AcState, AcExtra>, settings: AcSettings, stage?: StageSize): Scene {
  const st = step.state;
  const extra = step.extra ?? {};
  const nodes = st.nodes;
  const sets = settings.outputs === 'sets';
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  if (extra.link) roles.set(extra.link.kind === 'fail' ? failId(extra.link.from) : dictId(extra.link.from), 'active');

  // Labels sized for the finished links, so nodes hold still while the links are built.
  const final = linksOf(nodes);
  const wordText = (u: number, out: readonly string[]) =>
    sets ? (out.length ? out.join(',') : '') : (nodes[u]!.word ?? '');
  const widest = (u: number) => trieLabelWidth(wordText(u, final.out[u]!), WORD);
  const layout = layoutTrie(ROOT, (u) => nodes[u]!.kids, {
    label: (u) => nodes[u]!.ch,
    halfWidth: (u) => (wordText(u, final.out[u]!) ? R + RING + 4 + widest(u) : R + RING),
    radius: R,
    labelSize: 16,
    gap: 6,
    labelGap: 8,
    levelGap: 58,
  });
  const path = new Set(extra.path ?? []);
  const shapes: Shape[] = drawTrie(layout, {
    isEnd: (u) => nodes[u]!.word !== null,
    roles,
    baseRole: (u) => (path.has(u) ? 'visit' : u === st.cur && st.text ? 'active' : undefined),
  });
  const at = (u: number) => layout.nodes.get(u)!;
  for (const n of nodes) {
    const text = wordText(n.id, sets ? n.out.length || !n.word ? n.out : [n.word] : []);
    if (!text) continue;
    const p = at(n.id);
    shapes.push({
      kind: 'text',
      id: `word-${n.id}`,
      x: p.x + R + RING + 4,
      y: p.y + 5,
      text,
      size: WORD,
      mono: true,
      cls: 'label',
    });
  }

  // Links: a curve from u to v, bowed to one side.
  const curve = (id: string, u: number, v: number, side: number, role: MarkRole | undefined, dashed: boolean): Shape => {
    const a = at(u);
    const b = at(v);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const bow = Math.max(18, len * 0.22) * side;
    const mx = (a.x + b.x) / 2 - uy * bow;
    const my = (a.y + b.y) / 2 + ux * bow;
    const s = (p: { x: number; y: number }, q: { x: number; y: number }) => {
      const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return { x: p.x + ((q.x - p.x) / l) * (R + 3), y: p.y + ((q.y - p.y) / l) * (R + 3) };
    };
    const p1 = s(a, { x: mx, y: my });
    const p2 = s(b, { x: mx, y: my });
    return { kind: 'arrow', id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, via: { x: mx, y: my }, dashed, role, z: 0.5 };
  };
  for (const n of nodes) {
    if (n.id === ROOT || n.fail === null) continue;
    const id = failId(n.id);
    if (n.fail !== ROOT || roles.has(id)) shapes.push(curve(id, n.id, n.fail, 1, roles.get(id), true));
    if (!sets && n.dict !== null) {
      const did = dictId(n.id);
      shapes.push(curve(did, n.id, n.dict, -1, roles.get(did) ?? 'found', true));
    }
  }
  // Scale the scene's box to what is drawn: the trie plus the bow of any link.
  const trieBox = unionBounds(layout.bounds, ...shapesBox(shapes));

  // The text being scanned, over the trie.
  const top: Shape[] = [];
  let textBox: Bounds | null = null;
  if (st.text) {
    const n = st.text.length;
    const cx = trieBox.x + trieBox.w / 2;
    const x0 = cx - (n * CW) / 2;
    const y0 = trieBox.y - 60;
    top.push({ kind: 'text', id: 't-name', x: x0 - 10, y: y0 + 21, text: 'T', size: 20, weight: 'bold', mono: true, anchor: 'end', cls: 'label' });
    [...st.text].forEach((c, i) => {
      const id = textId(i);
      const role = roles.get(id) ?? (i < st.pos ? 'visit' : undefined);
      top.push({ kind: 'rect', id, x: x0 + i * CW, y: y0, w: CW, h: 30, r: 2, cls: 'cell live', role });
      top.push({ kind: 'text', id: `${id}-c`, x: x0 + i * CW + CW / 2, y: y0 + 22, text: c, size: 20, weight: 'bold', mono: true, anchor: 'middle', role: roles.get(id) });
      if (i % 2 === 0 || n <= 10)
        top.push({ kind: 'text', id: `ti-${i}`, x: x0 + i * CW + CW / 2, y: y0 - 6, text: String(i), size: 13, mono: true, anchor: 'middle', cls: 'index' });
    });
    textBox = { x: x0 - 34, y: y0 - 20, w: n * CW + 34, h: 50 };
  }

  // The matches and the legend.
  const panel = matchPanel(st, roles, sets);
  const main = unionBounds(trieBox, ...(textBox ? [textBox] : []));
  const under = { dx: main.x - panel.bounds.x, dy: main.y + main.h + 18 - panel.bounds.y };
  const beside = { dx: main.x + main.w + 28 - panel.bounds.x, dy: trieBox.y - panel.bounds.y };
  const options = [under, beside].map((o) => ({
    ...o,
    bounds: unionBounds(main, { ...panel.bounds, x: panel.bounds.x + o.dx, y: panel.bounds.y + o.dy }),
  }));
  const pick = pickBest(options, stage);
  return {
    shapes: [...shapes, ...top, ...translate(panel.shapes, pick.dx, pick.dy)],
    bounds: padBounds(pick.bounds, 14),
    label: describe(st),
  };
}

function shapesBox(shapes: readonly Shape[]): Bounds[] {
  const out: Bounds[] = [];
  for (const s of shapes)
    if (s.kind === 'arrow' && s.via) {
      const mx = (s.x1 + s.x2) / 4 + s.via.x / 2;
      const my = (s.y1 + s.y2) / 4 + s.via.y / 2;
      out.push({ x: mx - 4, y: my - 4, w: 8, h: 8 });
    } else if (s.kind === 'text' && s.id.startsWith('word-')) {
      out.push({ x: s.x, y: s.y - 12, w: s.text.length * WORD * 0.6, h: 16 });
    }
  return out;
}

function matchPanel(st: AcState, roles: ReadonlyMap<string, MarkRole>, sets: boolean): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [];
  const width = 300;
  let y = 0;
  if (st.text) {
    shapes.push({ kind: 'text', id: 'm-title', x: 0, y: 16, text: 'matches (word@start)', size: 15, mono: true, cls: 'label' });
    const all = refMatches(st.patterns, st.text);
    let x = 0;
    y = 26;
    all.forEach((m, k) => {
      const text = `${m.word}@${m.at}`;
      const w = text.length * 15 * 0.6 + 14;
      if (x > 0 && x + w > width) {
        x = 0;
        y += 36;
      }
      if (k < st.matches.length) {
        const shown = st.matches[k]!;
        const t = `${shown.word}@${shown.at}`;
        const role = roles.get(matchId(k));
        shapes.push({ kind: 'rect', id: matchId(k), x, y, w, h: 28, r: 6, cls: 'cell live', role });
        shapes.push({ kind: 'text', id: `${matchId(k)}-t`, x: x + w / 2, y: y + 19, text: t, size: 15, mono: true, weight: 'bold', anchor: 'middle', role });
      }
      x += w + 8;
    });
    y += all.length ? 42 : 4;
  }
  // Legend.
  const legend = (k: number, label: string, role: MarkRole | undefined) => {
    const ly = y + 14 + k * 24;
    shapes.push({ kind: 'arrow', id: `legend-${k}`, x1: 0, y1: ly - 5, x2: 34, y2: ly - 5, dashed: true, role });
    shapes.push({ kind: 'text', id: `legend-${k}-t`, x: 42, y: ly, text: label, size: 14, cls: 'label' });
  };
  legend(0, 'failure link (to the root: not drawn)', undefined);
  if (!sets) legend(1, 'output link', 'found');
  const h = y + (sets ? 24 : 48);
  return { shapes, bounds: { x: 0, y: 0, w: width, h } };
}
