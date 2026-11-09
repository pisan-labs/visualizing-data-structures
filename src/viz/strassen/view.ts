/**
 * Strassen: three parts, arranged for the stage.
 *
 *   the matrices   the call in focus (the running call, or its caller while a 1 × 1 product
 *                  runs): its two factors split into quadrants, each quadrant its own color,
 *                  and its product once it is put together. Padding zeros are faded.
 *   the formulas   the scheme of the call in focus: the sums, the products (done ones green,
 *                  the one being made blue) and the four blocks of C.
 *   the tree       the first call, its seven (or eight) products as boxes, and their products as
 *                  small squares; then the levels of the recursion with their counts, which is
 *                  the Master theorem's picture: 7^d calls of size n/2^d at level d.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { padBounds } from '../../layouts/calls';
import type { Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  asPart,
  box,
  dropPart,
  monoW,
  part,
  pickReadable,
  sideParts,
  stackParts,
  txt,
  type Part,
  type Placed,
} from '../_numbers/draw';
import {
  BLOCK_NAMES,
  blockAdds,
  combineText,
  describe,
  exprText,
  num,
  pathName,
  schemeOf,
  type Mat,
  type SCall,
  type StSettings,
  type StState,
} from './model';

const FONT = 13;
const LINE = 19;
const QUAD_ROLE: MarkRole[] = ['g1', 'g2', 'g3', 'g4'];

/** The call the matrices and formulas show. */
function focusOf(s: StState): SCall | undefined {
  if (!s.calls.length) return undefined;
  const id = s.current ?? 1;
  const c = s.calls[id - 1]!;
  return c.n === 1 && c.parent !== null ? s.calls[c.parent - 1] : c;
}

interface Grid {
  shapes: Shape[];
  w: number;
  h: number;
}

function grid(
  prefix: string,
  m: Mat | null,
  n: number,
  label: string,
  o: {
    roles: ReadonlyMap<string, MarkRole>;
    quads: boolean;
    found: boolean;
    pad: number;
    cellW: number;
    /** Write the entries (up to 4 × 4); an 8 × 8 matrix is drawn as its blocks only. */
    numbers: boolean;
  },
): Grid {
  const shapes: Shape[] = [];
  const cs = o.cellW;
  const ch = o.numbers ? Math.min(28, Math.max(22, cs)) : cs;
  const labelH = 20;
  shapes.push(
    txt(`${prefix}-label`, (n * cs) / 2, 14, label, FONT, { anchor: 'middle', weight: 'bold' }),
  );
  const h = n / 2;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const id = `${prefix}-${i}-${j}`;
      const q = n > 1 && o.quads ? (i < h ? 0 : 2) + (j < h ? 0 : 1) : -1;
      const role = o.roles.get(id) ?? (o.found ? 'found' : q >= 0 ? QUAD_ROLE[q] : undefined);
      const faded = i >= o.pad || j >= o.pad;
      // A gap between the quadrants, so the blocks read as blocks.
      const gx = n > 1 && j >= h ? 4 : 0;
      const gy = n > 1 && i >= h ? 4 : 0;
      const x = j * cs + gx;
      const y = labelH + i * ch + gy;
      shapes.push(
        box(id, x + 1, y + 1, cs - 2, ch - 2, { role, opacity: faded ? 0.45 : undefined }),
      );
      const v = o.numbers ? m?.[i]?.[j] : undefined;
      if (v !== undefined) {
        const text = num(v);
        const size = Math.min(14, (cs - 7) / (0.6 * Math.max(2, text.length)));
        shapes.push(
          txt(`${id}-t`, x + cs / 2, y + ch / 2 + size * 0.36, text, size, {
            anchor: 'middle',
            opacity: faded ? 0.6 : undefined,
          }),
        );
      }
    }
  return { shapes, w: n * cs + (n > 1 ? 4 : 0), h: labelH + n * ch + (n > 1 ? 4 : 0) };
}

/** The widest entry a matrix shows, for its cell width. */
const widest = (m: Mat) => Math.max(2, ...m.flat().map((v) => num(v).length));
const cellW = (chars: number) => Math.max(24, Math.ceil(monoW('x'.repeat(chars), 12) + 9));

function matrices(s: StState, roles: ReadonlyMap<string, MarkRole>, twoRows: boolean): Part {
  const c = focusOf(s);
  if (!c) {
    const t = txt('mt', 0, 16, 'A · B = C', 15, { weight: 'bold' });
    return part([t], { x: 0, y: 0, w: monoW('A · B = C', 15), h: 24 });
  }
  const scheme = schemeOf(s);
  const root = c.parent === null;
  const pad = root ? s.size : c.n;
  const labels = root
    ? ['A', 'B', 'C']
    : [
        scheme.products[c.part]!.leftText,
        scheme.products[c.part]!.rightText,
        scheme.products[c.part]!.name,
      ];
  const done = s.returned.includes(c.id);
  const quads = c.n > 1;
  const numbers = c.n <= 4;
  const wAB = numbers ? cellW(Math.max(widest(c.A), widest(c.B))) : 13;
  const wC = numbers ? cellW(widest(c.C)) : 13;
  const o = { roles, pad, numbers };
  const a = grid('ma', c.A, c.n, labels[0]!, { ...o, quads, found: false, cellW: wAB });
  const b = grid('mb', c.B, c.n, labels[1]!, { ...o, quads, found: false, cellW: wAB });
  const r = grid('mc', done ? c.C : null, c.n, labels[2]!, {
    ...o,
    quads: false,
    found: done,
    cellW: wC,
  });
  const op = (id: string, t: string, h: number): Part => ({
    shapes: [txt(id, 8, 20 + h / 2 + 6, t, 17, { anchor: 'middle', weight: 'bold' })],
    w: 16,
    h: h + 20,
  });
  const gh = a.h - 20;
  const parts = (g: Grid): Part => ({ shapes: g.shapes, w: g.w, h: g.h });
  const title = root
    ? `A·B, ${c.n} × ${c.n}${s.size !== c.n ? ` (${s.size} × ${s.size} padded)` : ''}`
    : `${pathName(s, c.id)}: ${c.n} × ${c.n}`;
  const head = part([txt('mt', 0, 16, title, 15, { weight: 'bold' })], {
    x: 0,
    y: 0,
    w: monoW(title, 15),
    h: 24,
  });
  const row = sideParts([parts(a), op('m-times', '·', gh), parts(b)], 8);
  const body = twoRows
    ? stackParts([asPart(row), asPart(sideParts([op('m-eq', '=', gh), parts(r)], 8))], 10)
    : sideParts([asPart(row), op('m-eq', '=', gh), parts(r)], 8);
  return asPart(stackParts([head, asPart(body)], 6));
}

function formulas(s: StState, roles: ReadonlyMap<string, MarkRole>, side: boolean): Part {
  const scheme = schemeOf(s);
  const c = focusOf(s);
  const shapes: Shape[] = [];
  const kids = c ? c.children.map((id) => s.calls[id - 1]!) : [];
  const inFocus = c && (s.current === c.id || s.calls[(s.current ?? 1) - 1]?.parent === c.id);
  // The product being made: the child of the focus call on the way to the running call.
  let making: number | null = null;
  if (c && s.current !== null && s.current !== c.id) {
    let id: number | null = s.current;
    while (id !== null && s.calls[id - 1]!.parent !== c.id) id = s.calls[id - 1]!.parent;
    if (id !== null) making = s.calls[id - 1]!.part;
  }
  const doneKid = (k: number) => !!kids[k] && s.returned.includes(kids[k]!.id);
  const phase = c && inFocus && s.current === c.id ? s.phase : 'products';
  const finished = !!c && s.returned.includes(c.id);
  const colW: number[] = [];
  let y = 0;
  const line = (id: string, x: number, text: string, role?: MarkRole, label = false) => {
    shapes.push(
      txt(id, x, y + FONT, text, FONT, {
        role: roles.get(id) ?? role,
        cls: !role && label ? 'label' : undefined,
        weight: role === 'active' ? 'bold' : 'normal',
      }),
    );
    colW.push(x + monoW(text, FONT));
  };
  if (scheme.sums.length) {
    const half = Math.ceil(scheme.sums.length / 2);
    const left = Math.max(
      ...scheme.sums.slice(0, half).map((x) => monoW(`${x.name} = ${exprText(x.expr)}`, FONT)),
    );
    const sumsDone = !!c && (phase !== 'split' || finished);
    for (let r = 0; r < half; r++) {
      for (const [col, k] of [
        [0, r],
        [1, r + half],
      ] as const) {
        const x = scheme.sums[k];
        if (!x) continue;
        line(
          `f-${x.name}`,
          col === 0 ? 0 : left + 18,
          `${x.name} = ${exprText(x.expr)}`,
          phase === 'sums' ? 'active' : undefined,
          !sumsDone,
        );
      }
      y += LINE;
    }
    y += 6;
  }
  const scalar = c?.n === 2;
  const top = y;
  let pw = 0;
  scheme.products.forEach((p, k) => {
    const v = scalar && doneKid(k) ? ` = ${num(kids[k]!.C[0]![0]!)}` : '';
    line(
      `f-${p.name}`,
      0,
      `${p.name} = ${p.leftText}·${p.rightText}${v}`,
      making === k && !finished ? 'active' : doneKid(k) ? 'done' : undefined,
      true,
    );
    pw = Math.max(pw, colW.at(-1)!);
    y += LINE;
  });
  const bottom = y;
  if (side) y = top;
  else y += 6;
  BLOCK_NAMES.forEach((b, k) => {
    line(
      `f-${b}`,
      side ? pw + 22 : 0,
      `${b} = ${combineText(scheme, k)}`,
      phase === 'combine' && s.current === c?.id ? 'active' : finished ? 'done' : undefined,
      true,
    );
    y += LINE;
  });
  const w = Math.max(...colW);
  return part(shapes, { x: 0, y: 0, w, h: Math.max(y, bottom) });
}

/** The tree: the first call, its products as boxes, theirs as squares. */
function tree(s: StState, roles: ReadonlyMap<string, MarkRole>): Part {
  const shapes: Shape[] = [];
  if (!s.calls.length) return { shapes, w: 0, h: 0 };
  const scheme = schemeOf(s);
  const k = scheme.products.length;
  const root = s.calls[0]!;
  const open = new Set<number>();
  for (let id = s.current; id !== null; id = s.calls[id - 1]!.parent) open.add(id);
  const state = (c: SCall): MarkRole | undefined =>
    roles.get(`node-${c.id}`) ??
    (c.id === s.current
      ? 'active'
      : s.returned.includes(c.id)
        ? 'done'
        : open.has(c.id)
          ? 'visit'
          : undefined);
  const made = (c: SCall) => c.id <= s.made;
  const bw = 38;
  const gap = 6;
  const sq = 9;
  const cols = 3;
  const rowW = k * bw + (k - 1) * gap;
  // The first call.
  const rw = Math.max(54, monoW(`${root.n}×${root.n}`, FONT) + 14);
  const rx = rowW / 2 - rw / 2;
  shapes.push(box(`node-1`, rx, 0, rw, 24, { role: state(root), r: 5 }));
  shapes.push(
    txt(`node-1-t`, rowW / 2, 12 + FONT * 0.36, `${root.n}×${root.n}`, FONT, {
      anchor: 'middle',
      weight: 'bold',
    }),
  );
  let bottom = 24;
  if (root.n > 1) {
    const y1 = 58;
    root.children.forEach((id, i) => {
      const c = s.calls[id - 1]!;
      const x = i * (bw + gap);
      shapes.push({
        kind: 'arrow',
        id: `tl-${id}`,
        x1: rowW / 2,
        y1: 24,
        x2: x + bw / 2,
        y2: y1,
        head: 'none',
        opacity: made(c) ? undefined : 0.35,
      });
      shapes.push(
        box(`node-${id}`, x, y1, bw, 22, {
          role: state(c),
          r: 4,
          opacity: made(c) ? undefined : 0.5,
        }),
      );
      shapes.push(
        txt(
          `node-${id}-t`,
          x + bw / 2,
          y1 + 11 + FONT * 0.36,
          scheme.products[c.part]!.name,
          FONT,
          {
            anchor: 'middle',
            weight: 'bold',
            opacity: made(c) ? undefined : 0.6,
          },
        ),
      );
      bottom = y1 + 22;
      if (c.n > 1) {
        const x0 = x + (bw - (cols * sq + (cols - 1) * 2)) / 2;
        c.children.forEach((g, j) => {
          const gc = s.calls[g - 1]!;
          shapes.push(
            box(
              `node-${g}`,
              x0 + (j % cols) * (sq + 2),
              y1 + 28 + Math.floor(j / cols) * (sq + 2),
              sq,
              sq,
              { role: state(gc), r: 1, opacity: made(gc) ? undefined : 0.4 },
            ),
          );
        });
        bottom = Math.max(bottom, y1 + 28 + Math.ceil(k / cols) * (sq + 2));
      }
    });
  }
  return part(shapes, { x: 0, y: 0, w: rowW, h: bottom });
}

/** The levels of the recursion: calls and work per level, and the recurrence. */
function levels(s: StState): Part {
  const shapes: Shape[] = [];
  if (!s.calls.length) return { shapes, w: 0, h: 0 };
  const scheme = schemeOf(s);
  const k = scheme.products.length;
  const root = s.calls[0]!;
  const L = Math.round(Math.log2(root.n));
  const adds = blockAdds(scheme);
  const per = adds.before + adds.after;
  let y = 0;
  const lines: { text: string; role?: MarkRole }[] = [];
  for (let d = 0; d <= L; d++) {
    const n = root.n / 2 ** d;
    const calls = k ** d;
    lines.push({
      text:
        d < L
          ? `level ${d}: ${calls} ${calls === 1 ? 'call' : 'calls'} of ${n}×${n}, ${calls * per * (n / 2) ** 2} adds`
          : `level ${d}: ${calls} ${calls === 1 ? 'call' : 'calls'} of 1×1, ${calls} ${calls === 1 ? 'mult' : 'mults'}`,
    });
  }
  const mults = k ** L;
  lines.push({
    text: `${mults} ${mults === 1 ? 'multiply' : 'multiplies'}, n³ = ${root.n ** 3}`,
    role: 'found',
  });
  lines.push({ text: k === 7 ? 'T(n) = 7T(n/2) + Θ(n²)' : 'T(n) = 8T(n/2) + Θ(n²)' });
  lines.push({ text: k === 7 ? 'so T(n) = Θ(n^log₂7) ≈ n^2.81' : 'so T(n) = Θ(n^log₂8) = Θ(n³)' });
  lines.forEach((l, i) => {
    shapes.push(
      txt(`lvl-${i}`, 0, y + FONT, l.text, FONT, {
        cls: l.role ? undefined : 'label',
        role: l.role,
      }),
    );
    y += LINE;
  });
  const w = Math.max(...lines.map((l) => monoW(l.text, FONT)));
  return part(shapes, { x: 0, y: 0, w, h: y });
}

export function view(
  step: Step<StState, undefined>,
  _settings: StSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const t = tree(s, roles);
  const lv = levels(s);
  const options: (Placed & { font: number })[] = [];
  const font = FONT;
  const add = (p: Placed) => options.push({ ...p, font });
  for (const [two, side] of [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ] as const) {
    const m = matrices(s, roles, two);
    const f = formulas(s, roles, side);
    const tl = asPart(stackParts([t, lv], 14));
    // Matrices over the tree and levels, the formulas beside them.
    add(sideParts([asPart(stackParts([m, tl], 22)), dropPart(f, ZOOM_DROP)], 34));
    // Matrices and formulas side by side, the tree and the levels side by side under them.
    add(
      stackParts(
        [asPart(sideParts([m, dropPart(f, ZOOM_DROP)], 34)), asPart(sideParts([t, lv], 30))],
        18,
      ),
    );
    // Matrices on top, then the formulas beside the tree and levels.
    add(stackParts([m, asPart(sideParts([f, tl], 30))], 22));
    // Everything in one column.
    add(stackParts([m, f, tl], 20));
  }
  const best = pickReadable(stage, options);
  return { shapes: best.shapes, bounds: padBounds(best.bounds, 12), label: describe(s) };
}
