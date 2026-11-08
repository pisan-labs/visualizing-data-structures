import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds } from '../../layouts/calls';
import type { Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  asPart,
  box,
  drawTable,
  dropPart,
  mid,
  monoW,
  part,
  sideParts,
  stackParts,
  txt,
  type Col,
  type Part,
  type TableCell,
} from '../_numbers/draw';
import { bitsPart } from '../mod-pow/view';
import { describe, phiName, type RsaSettings, type RsaState } from './model';

const SIZE = 16;
const ROW_H = 28;

const show = (v: number | null | undefined) => (v === null || v === undefined ? '?' : String(v));
const num = (v: number | null) => (v === null ? '' : String(v).replace('-', '−'));

/** The keys as a card: a label and a value box per line. Ids key-p, key-q, ... */
function keyCard(s: RsaState, settings: RsaSettings, roles: ReadonlyMap<string, MarkRole>): Part {
  const k = s.keys;
  const t = k?.totient ?? settings.phi;
  const pub = k && k.e !== null && k.n !== null ? `(${k.e}, ${k.n})` : '?';
  const priv = k && k.d !== null && k.n !== null ? `(${k.d}, ${k.n})` : '?';
  const lines: [string, string, string, boolean][] = [
    ['key-p', 'p (secret)', show(k?.p), false],
    ['key-q', 'q (secret)', show(k?.q), false],
    ['key-n', 'n = p·q', show(k?.n), false],
    ['key-phi', t === 'euler' ? 'φ(n) (secret)' : 'λ(n) (secret)', show(k?.phi), false],
    ['key-e', 'e', show(k?.e), false],
    ['key-d', 'd (secret)', show(k?.d), false],
    ['key-pub', 'public key', pub, true],
    ['key-priv', 'private key', priv, true],
  ];
  const shapes: Shape[] = [];
  const LW = 150;
  const VW = 118;
  lines.forEach(([id, label, value, bold], r) => {
    const y = r * ROW_H;
    shapes.push(txt(`${id}-label`, 0, mid(y, ROW_H, 15), label, 15, { cls: 'label' }));
    const role = roles.get(id);
    shapes.push(box(id, LW, y + 2, VW, ROW_H - 4, { role }));
    const size = Math.min(SIZE, (VW - 8) / (value.length * 0.6));
    shapes.push(
      txt(`${id}-t`, LW + VW / 2, mid(y, ROW_H, size), value, size, {
        anchor: 'middle',
        weight: bold || id === 'key-d' || id === 'key-e' ? 'bold' : 'normal',
        role,
      }),
    );
  });
  return { shapes, w: LW + VW, h: lines.length * ROW_H };
}

/** The e values tried, a chip each: ✗ when gcd(e, φ) > 1, ✓ for the one kept. Ids try-k. */
function triedPart(s: RsaState, roles: ReadonlyMap<string, MarkRole>): Part {
  const shapes: Shape[] = [];
  if (!s.tried.length) return { shapes, w: 0, h: 0 };
  shapes.push(txt('try-label', 0, 18, 'e tried:', 15, { cls: 'label' }));
  const W = 52;
  const perRow = 4;
  s.tried.forEach((t, i) => {
    const x = 84 + (i % perRow) * W;
    const y = Math.floor(i / perRow) * 30;
    const ok = t.g === 1;
    const role = roles.get(`try-${i}`) ?? (ok ? 'found' : undefined);
    const label = `${t.e} ${ok ? '✓' : '✗'}`;
    shapes.push(box(`try-${i}`, x, y + 2, W - 6, 26, { role, opacity: ok ? 1 : 0.8 }));
    shapes.push(
      txt(`try-${i}-t`, x + (W - 6) / 2, mid(y + 2, 26, 15), label, 15, { anchor: 'middle', role }),
    );
  });
  const rows = Math.ceil(s.tried.length / perRow);
  return { shapes, w: 84 + Math.min(perRow, s.tried.length) * W, h: rows * 30 };
}

/** m → c → m, the message's trip. Ids msg-m, msg-c, msg-back. */
function messagePart(s: RsaState, roles: ReadonlyMap<string, MarkRole>): Part {
  const shapes: Shape[] = [];
  const items: [string, string, number | null][] = [
    ['msg-m', 'm', s.m],
    ['msg-c', 'c', s.c],
    ['msg-back', 'm', s.back],
  ];
  const W = 76;
  items.forEach(([id, label, v], i) => {
    const x = i * (W + 34);
    shapes.push(txt(`${id}-label`, x + W / 2, 14, label, 15, { anchor: 'middle', cls: 'label' }));
    const role = roles.get(id);
    shapes.push(box(id, x, 20, W, 30, { role }));
    shapes.push(
      txt(`${id}-t`, x + W / 2, mid(20, 30, SIZE), v === null ? '' : String(v), SIZE, {
        anchor: 'middle',
        weight: 'bold',
        role,
      }),
    );
    if (i < 2)
      shapes.push({
        kind: 'arrow',
        id: `${id}-arrow`,
        x1: x + W + 4,
        y1: 35,
        x2: x + W + 30,
        y2: 35,
      });
  });
  return { shapes, w: 3 * W + 2 * 34, h: 52 };
}

function title(id: string, text: string): Part {
  return part([txt(id, 0, 18, text, 16, { weight: 'bold' })], {
    x: 0,
    y: 0,
    w: monoW(text, 16),
    h: 26,
  });
}

/** The work of the last operation: extended Euclid for d, or square-and-multiply. */
function workPart(s: RsaState, roles: ReadonlyMap<string, MarkRole>): Part | null {
  const k = s.keys;
  if (s.focus === 'pow' && s.work && k) {
    const ps = s.work.pow;
    const cols: Col[] = [
      { key: 'i', head: 'i', w: 36 },
      { key: 'bit', head: 'bit', w: 44 },
      { key: 'c', head: 'exp', w: 62 },
      { key: 'sq', head: 'x·x mod n', w: 96 },
      { key: 'mul', head: 'x·base', w: 84 },
    ];
    const cell = (v: number | null, bold = false): TableCell => ({ text: num(v), bold });
    const rows = ps.rows.map((r) => ({
      i: { text: String(r.i), bare: true },
      bit: cell(r.bit),
      c: cell(r.c),
      sq: cell(r.squared, true),
      mul: r.bit === 0 ? { text: '–', bare: true } : cell(r.multiplied, true),
    }));
    const table = drawTable('mp', 0, 0, cols, rows, {
      size: SIZE,
      rowH: 26,
      room: ps.bits.length,
      roles,
    });
    const what =
      s.work.kind === 'encrypt'
        ? `c = ${ps.a}^${ps.b} mod ${ps.m}`
        : `m = ${ps.a}^${ps.b} mod ${ps.m}`;
    return stackPartsAsPart([
      title('work-title', what),
      bitsPart(ps, roles),
      asPart({ shapes: table.shapes, bounds: table.bounds }),
    ]);
  }
  if (s.euTotal && k) {
    const cols: Col[] = [
      { key: 'a', head: 'a', w: 62 },
      { key: 'b', head: 'b', w: 62 },
      { key: 'q', head: '⌊a/b⌋', w: 62 },
      { key: 'r', head: 'a mod b', w: 76 },
      { key: 'x', head: 'x', w: 62 },
      { key: 'y', head: 'y', w: 62 },
    ];
    const rows = s.euRows.map((r) => ({
      a: { text: num(r.a) },
      b: { text: num(r.b) },
      q: { text: r.b === 0 ? '–' : num(r.q) },
      r: { text: r.b === 0 ? '–' : num(r.r) },
      x: { text: num(r.x), bold: true },
      y: { text: num(r.y), bold: true },
    }));
    const table = drawTable('eu', 0, 0, cols, rows, {
      size: SIZE,
      rowH: ROW_H,
      room: s.euTotal,
      roles,
    });
    return stackPartsAsPart([
      title('work-title', `d: extended Euclid on (${phiName(k.totient!).slice(0, 1)}, e)`),
      asPart({ shapes: table.shapes, bounds: table.bounds }),
    ]);
  }
  return null;
}

const stackPartsAsPart = (parts: Part[]) => asPart(stackParts(parts, 8));

export function view(
  step: Step<RsaState, undefined>,
  settings: RsaSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const head = title('rsa-title', s.keys?.n ? `RSA with n = ${s.keys.n}` : 'RSA (toy sizes)');
  const card = keyCard(s, settings, roles);
  const left = stackPartsAsPart(
    [head, card, triedPart(s, roles), messagePart(s, roles), warning(s)].filter((p) => p.w),
  );
  const work = workPart(s, roles);
  const wide = work ? sideParts([left, dropPart(work, ZOOM_DROP)], 32) : stackParts([left], 0);
  const tall = work ? stackParts([left, work], 18) : stackParts([left], 0);
  const place = pickLayout(stage, [wide, tall]);
  return { shapes: place.shapes, bounds: padBounds(place.bounds, 12), label: describe(s) };
}

/** A reminder on the drawing that these keys are toys. */
function warning(s: RsaState): Part {
  const k = s.keys;
  if (!k || k.n === null) return { shapes: [], w: 0, h: 0 };
  const text = `toy key: ${k.n} = ${k.p}·${k.q}`;
  return part([txt('rsa-warn', 0, 17, text, 16, { cls: 'label' })], {
    x: 0,
    y: 0,
    w: monoW(text, 16),
    h: 22,
  });
}
