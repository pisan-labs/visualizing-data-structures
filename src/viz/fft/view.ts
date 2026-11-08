import type { MarkRole, StageSize, Step } from '../../engine/types';
import { padBounds } from '../../layouts/calls';
import type { Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  asPart,
  box,
  drawLines,
  dropPart,
  part,
  pickReadable,
  sideParts,
  stackParts,
  txt,
  type Part,
} from '../_numbers/draw';
import {
  bitReverse,
  describe,
  log2,
  nodeId,
  polyText,
  type C,
  type FftSettings,
  type FftState,
} from './model';

const BOX_W = 72;
const BOX_H = 40;
const ROW = 46;
const GAP = 26;
const LABEL_W = 34;
const HEAD_H = 26;
const SIZE = 14;

/** A complex value in two lines: the real part over the imaginary part, rounded. */
function parts(z: C): [string, string] {
  const r = (x: number) => {
    const v = Math.round(x * 100) / 100;
    return v === 0 ? 0 : v;
  };
  const re = r(z[0]);
  const im = r(z[1]);
  const num = (v: number) => String(v).replace('-', '−');
  if (im === 0) return [num(re), ''];
  const imText = `${im < 0 ? '−' : '+'}${Math.abs(im) === 1 ? '' : num(Math.abs(im))}i`;
  return [re === 0 ? '' : num(re), imText];
}

/** The butterfly network: a column per level, a box per value, the crossing lines between. */
function networkPart(s: FftState, roles: ReadonlyMap<string, MarkRole>): Part {
  const shapes: Shape[] = [];
  const n = s.n || 8;
  const bits = log2(n);
  const colX = (c: number) => LABEL_W + c * (BOX_W + GAP);
  const rowY = (r: number) => HEAD_H + r * ROW;
  const heads = ['input', ...Array.from({ length: bits }, (_, l) => `size ${2 ** (l + 1)}`)];
  heads.forEach((h, c) =>
    shapes.push(
      txt(`net-head-${c}`, colX(c) + BOX_W / 2, 16, h, 14, { anchor: 'middle', cls: 'label' }),
    ),
  );
  const b = s.butterfly;
  // Lines first, so boxes sit on top.
  for (let level = 1; level <= bits; level++) {
    const m = 2 ** level;
    for (let j = 0; j < n / m; j++)
      for (let k = 0; k < m / 2; k++) {
        const r0 = j * m + k;
        const r1 = r0 + m / 2;
        const on = b && b.level === level && b.r0 === r0;
        for (const [from, to] of [
          [r0, r0],
          [r1, r0],
          [r0, r1],
          [r1, r1],
        ] as const) {
          const id = `edge-${level}-${from}-${to}`;
          shapes.push({
            kind: 'arrow',
            id,
            x1: colX(level - 1) + BOX_W,
            y1: rowY(from) + BOX_H / 2,
            x2: colX(level),
            y2: rowY(to) + BOX_H / 2,
            head: 'none',
            role: roles.get(id) ?? (on ? 'active' : undefined),
            opacity: on ? 1 : 0.45,
          });
        }
      }
  }
  for (let c = 0; c <= bits; c++)
    for (let r = 0; r < n; r++) {
      const id = nodeId(c, r);
      const z = s.net[c]?.[r] ?? null;
      const role = roles.get(id);
      shapes.push(box(id, colX(c), rowY(r), BOX_W, BOX_H, { role, cls: z ? 'live' : undefined }));
      if (!z) continue;
      const [a, bText] = parts(z);
      const lines = [a, bText].filter(Boolean);
      lines.forEach((t, i) => {
        const size = Math.min(SIZE, (BOX_W - 6) / (t.length * 0.6));
        const y =
          lines.length === 1 ? rowY(r) + BOX_H / 2 + size * 0.36 : rowY(r) + (i === 0 ? 16 : 33);
        shapes.push(
          txt(`${id}-${i}`, colX(c) + BOX_W / 2, y, t, size, {
            anchor: 'middle',
            weight: c === bits ? 'bold' : 'normal',
            role,
          }),
        );
      });
    }
  // Which input sits in each row, and which output.
  const inLabel = s.inverse ? 'Ĉ' : s.phase === 'B' ? 'b' : 'a';
  for (let r = 0; r < n; r++) {
    shapes.push(
      txt(
        `net-in-${r}`,
        LABEL_W - 4,
        rowY(r) + BOX_H / 2 + 5,
        `${inLabel}${bitReverse(r, bits)}`,
        13,
        {
          anchor: 'end',
          cls: 'index',
        },
      ),
    );
    shapes.push(
      txt(`net-out-${r}`, colX(bits) + BOX_W + 4, rowY(r) + BOX_H / 2 + 5, `${r}`, 13, {
        cls: 'index',
      }),
    );
  }
  return { shapes, w: colX(bits) + BOX_W + 20, h: rowY(n - 1) + BOX_H + 2 };
}

/** The nth roots of unity on the unit circle, the twiddle in use marked. Ids root-j. */
function circlePart(
  s: FftState,
  settings: FftSettings,
  roles: ReadonlyMap<string, MarkRole>,
): Part {
  const shapes: Shape[] = [];
  const n = s.n || 8;
  const R = 62;
  const cx = 92;
  const cy = 30 + R + 20;
  const dir = settings.sign === 'clrs' ? 1 : -1;
  const title = `ω = e^(${dir < 0 ? '−' : ''}2πi/${n})`;
  shapes.push(txt('circle-title', 0, 16, title, 14, { cls: 'label' }));
  shapes.push({ kind: 'circle', id: 'unit', x: cx, y: cy, r: R, cls: 'ghost' });
  shapes.push({
    kind: 'arrow',
    id: 'axis-x',
    x1: cx - R - 12,
    y1: cy,
    x2: cx + R + 12,
    y2: cy,
    head: 'none',
    opacity: 0.4,
  });
  shapes.push({
    kind: 'arrow',
    id: 'axis-y',
    x1: cx,
    y1: cy - R - 12,
    x2: cx,
    y2: cy + R + 12,
    head: 'none',
    opacity: 0.4,
  });
  for (let j = 0; j < n; j++) {
    const a = (dir * 2 * Math.PI * j) / n;
    // Up is +i: the drawing's y grows down.
    const x = cx + R * Math.cos(a);
    const y = cy - R * Math.sin(a);
    const id = `root-${j}`;
    const role = roles.get(id);
    shapes.push({ kind: 'circle', id, x, y, r: role ? 7 : 5, role: role ?? 'done', cls: 'live' });
    const lx = cx + (R + 17) * Math.cos(a);
    const ly = cy - (R + 17) * Math.sin(a) + 5;
    shapes.push(
      txt(`${id}-t`, lx, ly, j === 0 ? '1' : `ω${j === 1 ? '' : sup(j)}`, 13, {
        anchor: 'middle',
        role,
      }),
    );
  }
  return { shapes, w: Math.max(cx + R + 34, title.length * 14 * 0.6), h: cy + R + 26 };
}

const sup = (k: number) => String(k).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]!);

function notesPart(s: FftState): Part {
  const lines: { text: string; role?: MarkRole; bold?: boolean }[] = [];
  if (s.mode === 'multiply') {
    const deg = (cs: number[]) => {
      let k = cs.length - 1;
      while (k > 0 && cs[k] === 0) k--;
      return cs.slice(0, k + 1);
    };
    lines.push({ text: `A = ${polyText(deg(s.a))}` }, { text: `B = ${polyText(deg(s.b))}` });
    lines.push(
      s.c ? { text: `A·B = ${polyText(s.c)}`, role: 'found', bold: true } : { text: `A·B = ?` },
    );
  } else if (s.mode === 'fft') lines.push({ text: `a = [${s.a.join(', ')}]` });
  if (s.title) lines.push({ text: s.title, bold: true });
  const d = drawLines('fft-note', 0, 0, lines, 14, { room: 4 });
  return part(d.shapes, d.bounds);
}

export function view(
  step: Step<FftState, undefined>,
  settings: FftSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const net = networkPart(s, roles);
  const circle = circlePart(s, settings, roles);
  const notes = notesPart(s);
  const side = asPart(stackParts([circle, notes], 14));
  const options = [
    { ...sideParts([net, dropPart(side, ZOOM_DROP)], 30), font: 12 },
    { ...stackParts([net, asPart(sideParts([circle, notes], 20))], 16), font: 12 },
    { ...stackParts([net, circle, notes], 14), font: 12 },
  ];
  const place = pickReadable(stage, options);
  return { shapes: place.shapes, bounds: padBounds(place.bounds, 12), label: describe(s) };
}
