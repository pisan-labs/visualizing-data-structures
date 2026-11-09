/**
 * The trie of patterns (src/layouts/trie.ts), each node that ends a pattern ringed and labeled
 * with it, under its right side, or its left or centre when a link runs there (with output sets,
 * the whole set); failure links as dashed curves (links to the root
 * are left out unless a step uses one) and output links as colored dashed curves. During a scan
 * the text sits above the trie, and the matches found so far beside or under it, with a legend.
 */
import './words.css';
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

const overlaps = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** An arrow (a quadratic through `via`, or straight) as points along it. */
function curvePoints(sh: Extract<Shape, { kind: 'arrow' }>): { x: number; y: number }[] {
  const c = sh.via ?? { x: (sh.x1 + sh.x2) / 2, y: (sh.y1 + sh.y2) / 2 };
  return Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    const k = 1 - t;
    return {
      x: k * k * sh.x1 + 2 * k * t * c.x + t * t * sh.x2,
      y: k * k * sh.y1 + 2 * k * t * c.y + t * t * sh.y2,
    };
  });
}

export function view(step: Step<AcState, AcExtra>, settings: AcSettings, stage?: StageSize): Scene {
  const st = step.state;
  const extra = step.extra ?? {};
  const nodes = st.nodes;
  const sets = settings.outputs === 'sets';
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  if (extra.link)
    roles.set(
      extra.link.kind === 'fail' ? failId(extra.link.from) : dictId(extra.link.from),
      'active',
    );

  // Labels sized for the finished links, so nodes hold still while the links are built.
  const final = linksOf(nodes);
  const wordText = (u: number, out: readonly string[]) =>
    sets ? (out.length ? out.join(',') : '') : (nodes[u]!.word ?? '');
  const widest = (u: number) => trieLabelWidth(wordText(u, final.out[u]!), WORD);
  const layout = layoutTrie(ROOT, (u) => nodes[u]!.kids, {
    label: (u) => nodes[u]!.ch,
    halfWidth: (u) => (wordText(u, final.out[u]!) ? 9 + widest(u) : R + RING),
    radius: R,
    labelSize: 16,
    gap: 14,
    labelGap: 8,
    levelGap: 64,
  });
  const path = new Set(extra.path ?? []);
  const shapes: Shape[] = drawTrie(layout, {
    isEnd: (u) => nodes[u]!.word !== null,
    roles,
    baseRole: (u) => (path.has(u) ? 'visit' : u === st.cur && st.text ? 'active' : undefined),
  });
  const at = (u: number) => layout.nodes.get(u)!;
  // Links: a curve from u to v, bowed to one side.
  const curve = (
    id: string,
    u: number,
    v: number,
    side: number,
    role: MarkRole | undefined,
    dashed: boolean,
  ): Shape => {
    const a = at(u);
    const b = at(v);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const bow = Math.max(16, len * 0.16) * side;
    const mx = (a.x + b.x) / 2 - uy * bow;
    const my = (a.y + b.y) / 2 + ux * bow;
    const s = (p: { x: number; y: number }, q: { x: number; y: number }) => {
      const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return { x: p.x + ((q.x - p.x) / l) * (R + 3), y: p.y + ((q.y - p.y) / l) * (R + 3) };
    };
    const p1 = s(a, { x: mx, y: my });
    const p2 = s(b, { x: mx, y: my });
    return {
      kind: 'arrow',
      id,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      via: { x: mx, y: my },
      dashed,
      role,
      z: 0.5,
    };
  };
  for (const n of nodes) {
    if (n.id === ROOT || n.fail === null) continue;
    const id = failId(n.id);
    if (n.fail !== ROOT || roles.has(id))
      shapes.push(curve(id, n.id, n.fail, 1, roles.get(id), true));
    if (!sets && n.dict !== null) {
      const did = dictId(n.id);
      shapes.push(curve(did, n.id, n.dict, -1, roles.get(did) ?? 'found', true));
    }
  }
  // Word labels go under their node: to the right if that is clear, else to the left or
  // centred, whichever crosses the fewest links, nodes and labels already placed.
  const lines = shapes.flatMap((sh) => (sh.kind === 'arrow' ? [curvePoints(sh)] : []));
  const placed: Bounds[] = [];
  const order = nodes
    .map((n) => ({
      n,
      text: wordText(n.id, sets ? (n.out.length || !n.word ? n.out : [n.word]) : []),
    }))
    .filter((w) => w.text)
    .sort((a, b) => at(a.n.id).x - at(b.n.id).x);
  for (const { n, text } of order) {
    const p = at(n.id);
    const w = trieLabelWidth(text, WORD);
    const below = p.y + R + RING + 14;
    const side = R + RING + 4;
    let best: {
      score: number;
      x: number;
      y: number;
      anchor: 'start' | 'middle' | 'end';
      box: Bounds;
    } | null = null;
    for (const [k, anchor, left, y] of [
      [0, 'start', p.x + 9, below],
      [1, 'end', p.x - 9 - w, below],
      [1.5, 'middle', p.x - w / 2, below],
      [2, 'start', p.x + side, p.y + 5],
      [2.5, 'end', p.x - side - w, p.y + 5],
    ] as const) {
      const box = { x: left - 2, y: y - WORD * 0.85, w: w + 4, h: WORD * 1.1 };
      const inside = (q: { x: number; y: number }) =>
        q.x > box.x && q.x < box.x + box.w && q.y > box.y && q.y < box.y + box.h;
      let score = k;
      for (const line of lines) if (line.some(inside)) score += 4;
      for (const o of placed) if (overlaps(o, box)) score += 20;
      for (const m of nodes) {
        const c = at(m.id);
        if (
          overlaps(box, {
            x: c.x - R - RING,
            y: c.y - R - RING,
            w: 2 * (R + RING),
            h: 2 * (R + RING),
          })
        )
          score += 20;
      }
      if (!best || score < best.score)
        best = {
          score,
          x: anchor === 'start' ? left : anchor === 'end' ? left + w : p.x,
          y,
          anchor,
          box,
        };
    }
    placed.push(best!.box);
    shapes.push({
      kind: 'text',
      id: `word-${n.id}`,
      x: best!.x,
      y: best!.y,
      text,
      size: WORD,
      mono: true,
      // A halo the page's stylesheet draws, so a link passing behind never runs through it.
      cls: 'label ac-word',
      ...(best!.anchor === 'start' ? {} : { anchor: best!.anchor }),
    });
  }

  // The trie's box, with room for the bow of a link: the same on every step of an operation.
  const lb = layout.bounds;
  // A word label moved to a node's left may stick out past it.
  const trieBox = unionBounds({ x: lb.x - 18, y: lb.y - 6, w: lb.w + 36, h: lb.h + 12 }, ...placed);

  // The text being scanned, as a part placed at (0, 0).
  const text: Shape[] = [];
  let textBox: Bounds = { x: 0, y: 0, w: 0, h: 0 };
  if (st.text) {
    const n = st.text.length;
    const x0 = 34;
    const y0 = 20;
    text.push({
      kind: 'text',
      id: 't-name',
      x: x0 - 10,
      y: y0 + 21,
      text: 'T',
      size: 20,
      weight: 'bold',
      mono: true,
      anchor: 'end',
      cls: 'label',
    });
    [...st.text].forEach((c, i) => {
      const id = textId(i);
      const role = roles.get(id) ?? (i < st.pos ? 'visit' : undefined);
      text.push({
        kind: 'rect',
        id,
        x: x0 + i * CW,
        y: y0,
        w: CW,
        h: 30,
        r: 2,
        cls: 'cell live',
        role,
      });
      text.push({
        kind: 'text',
        id: `${id}-c`,
        x: x0 + i * CW + CW / 2,
        y: y0 + 22,
        text: c,
        size: 20,
        weight: 'bold',
        mono: true,
        anchor: 'middle',
        role: roles.get(id),
      });
      if (i % 2 === 0 || n <= 10)
        text.push({
          kind: 'text',
          id: `ti-${i}`,
          x: x0 + i * CW + CW / 2,
          y: y0 - 6,
          text: String(i),
          size: 15,
          mono: true,
          anchor: 'middle',
          cls: 'index',
        });
    });
    textBox = { x: 0, y: 0, w: x0 + n * CW, h: y0 + 34 };
  }

  // Tall: the text over the trie, the matches under it. Wide: both in a column beside it.
  const panel = matchPanel(st, roles, sets);
  const tall = (() => {
    const tx = trieBox.x + trieBox.w / 2 - textBox.w / 2;
    const ty = trieBox.y - textBox.h - 8;
    const top = Math.min(trieBox.y, ty);
    const left = Math.min(trieBox.x, tx);
    const px = left;
    const py = trieBox.y + trieBox.h + 14;
    return {
      tx,
      ty,
      px,
      py,
      bounds: unionBounds(
        trieBox,
        { ...textBox, x: tx, y: ty },
        { ...panel.bounds, x: px, y: py },
        { x: left, y: top, w: 1, h: 1 },
      ),
    };
  })();
  const wide = (() => {
    const tx = trieBox.x + trieBox.w + 24;
    const ty = trieBox.y;
    const px = tx;
    const py = ty + textBox.h + (st.text ? 12 : 0);
    return {
      tx,
      ty,
      px,
      py,
      bounds: unionBounds(trieBox, { ...textBox, x: tx, y: ty }, { ...panel.bounds, x: px, y: py }),
    };
  })();
  const pick = pickBest([tall, wide], stage);
  return {
    shapes: [
      ...shapes,
      ...translate(text, pick.tx, pick.ty),
      ...translate(panel.shapes, pick.px, pick.py),
    ],
    bounds: padBounds(pick.bounds, 14),
    label: describe(st),
  };
}

function matchPanel(
  st: AcState,
  roles: ReadonlyMap<string, MarkRole>,
  sets: boolean,
): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [];
  const width = 300;
  let y = 0;
  if (st.text) {
    shapes.push({
      kind: 'text',
      id: 'm-title',
      x: 0,
      y: 16,
      text: 'matches (word@start)',
      size: 15,
      mono: true,
      cls: 'label',
    });
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
        shapes.push({
          kind: 'text',
          id: `${matchId(k)}-t`,
          x: x + w / 2,
          y: y + 19,
          text: t,
          size: 15,
          mono: true,
          weight: 'bold',
          anchor: 'middle',
          role,
        });
      }
      x += w + 8;
    });
    y += all.length ? 42 : 4;
  }
  // Legend.
  const legend = (k: number, label: string, role: MarkRole | undefined) => {
    const ly = y + 14 + k * 24;
    shapes.push({
      kind: 'arrow',
      id: `legend-${k}`,
      x1: 0,
      y1: ly - 5,
      x2: 34,
      y2: ly - 5,
      dashed: true,
      role,
    });
    shapes.push({
      kind: 'text',
      id: `legend-${k}-t`,
      x: 42,
      y: ly,
      text: label,
      size: 14,
      cls: 'label',
    });
  };
  legend(0, 'failure link (to the root: not drawn)', undefined);
  if (!sets) legend(1, 'output link', 'found');
  const h = y + (sets ? 24 : 48);
  return { shapes, bounds: { x: 0, y: 0, w: width, h } };
}
