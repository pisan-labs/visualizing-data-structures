/**
 * The Myhill–Nerode page: the language on top, then the last operation's picture.
 *
 * - Find classes: the classes found so far (each with its word and the words that joined it,
 *   in its group color, ∈ L for the accepting ones), the triangle of class words with the
 *   suffix that tells each pair apart, and the minimal DFA growing as moves are found. Room is
 *   kept for where the search ends, so nothing jumps; the three parts go side by side or one
 *   under another, whichever draws largest on the stage.
 * - Words apart: the triangle of the words typed, a suffix in each cell (≡ for equivalent).
 * - Infinitely many: the triangle of ε, a, aa, ..., each cell the suffix bⁱ.
 */
import { groupRole, type MarkRole, type StageSize, type Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import { drawAutomaton, layoutStates, stateId } from '../../layouts/automaton';
import { beside, below, padBounds, textWidth, translate, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { makeAutomaton } from '../_automata/automaton';
import { alphabetOf, label, member, wordText as w } from './language';
import {
  DFA_PREFIX,
  cellId,
  classRowId,
  describe,
  pairKey,
  stateName,
  type ApartPanel,
  type ClassesPanel,
  type FamilyPanel,
  type MnSettings,
  type MnState,
} from './model';

const CELL_H = 24;
const PITCH = 27;
const HEAD = 14;
const TEXT = 14;
const TITLE = 13;
const LIST_CHARS = 22;

type Block = (out: Shape[], x: number, y: number) => Bounds;

function title(out: Shape[], id: string, text: string, x: number, y: number) {
  out.push({ kind: 'text', id, x, y: y + 13, text, size: TITLE, cls: 'label' });
}

const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * A triangle with a cell for each pair of words, the later word's row and the earlier word's
 * column: rows 1 to n − 1, columns 0 to n − 2, headers above and to the left. `n` is the room
 * kept; words not known yet leave their headers blank.
 */
function triangle(
  out: Shape[],
  o: {
    x: number;
    y: number;
    n: number;
    words: (string | undefined)[];
    text: (i: number, j: number) => string | undefined;
    widest: string[];
    roles: ReadonlyMap<string, MarkRole>;
    title: string;
  },
): Bounds {
  const { x, y, n, roles } = o;
  title(out, 'pt-title', o.title, x, y);
  const top = y + 22;
  const labels = o.words.map((s) => (s === undefined ? '' : w(s)));
  const headW = Math.max(26, ...labels.map((t) => textWidth(t, HEAD, true) + 12));
  const cw = Math.max(
    36,
    ...labels.map((t) => textWidth(t, HEAD, true) + 10),
    ...o.widest.map((t) => textWidth(t, TEXT, true) + 12),
  );
  if (n < 2) {
    out.push({
      kind: 'text',
      id: 'pt-none',
      x,
      y: top + 16,
      text: 'one word: no pairs',
      size: 13,
      cls: 'label',
    });
    return { x, y, w: 130, h: 44 };
  }
  for (let j = 0; j < n - 1; j++)
    if (o.words[j] !== undefined)
      out.push({
        kind: 'text',
        id: `pt-c-${j}`,
        x: x + headW + j * (cw + 3) + cw / 2,
        y: top + 14,
        text: labels[j]!,
        size: HEAD,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(`pt-c-${j}`),
      });
  for (let i = 1; i < n; i++) {
    const ry = top + 20 + (i - 1) * PITCH;
    if (o.words[i] !== undefined)
      out.push({
        kind: 'text',
        id: `pt-r-${i}`,
        x: x + headW - 8,
        y: ry + CELL_H / 2 + 5,
        text: labels[i]!,
        size: HEAD,
        anchor: 'end',
        weight: 'bold',
        mono: true,
        role: roles.get(`pt-r-${i}`),
      });
    for (let j = 0; j < i; j++) {
      const id = cellId(i, j);
      const known = o.words[i] !== undefined;
      const t = known ? o.text(i, j) : undefined;
      const role = roles.get(id);
      const cx = x + headW + j * (cw + 3);
      out.push({
        kind: 'rect',
        id,
        x: cx,
        y: ry,
        w: cw,
        h: CELL_H,
        r: 3,
        cls: t !== undefined ? 'live' : undefined,
        role,
      });
      if (t)
        out.push({
          kind: 'text',
          id: `${id}-t`,
          x: cx + cw / 2,
          y: ry + CELL_H / 2 + 5,
          text: t,
          size: TEXT,
          anchor: 'middle',
          mono: true,
          role: role === 'error' ? 'error' : undefined,
        });
    }
  }
  return { x, y, w: headW + (n - 1) * (cw + 3) - 3, h: 22 + 20 + (n - 1) * PITCH - 3 };
}

/** The classes: one row each, its word in brackets and the words that joined it. */
function classList(
  out: Shape[],
  p: ClassesPanel,
  s: MnState,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  title(out, 'cls-title', 'Classes, and the words in each', x, y);
  const width = textWidth('x'.repeat(LIST_CHARS + 6), TEXT, true) + 16;
  const n = p.final.reps.length;
  p.reps.forEach((rep, i) => {
    const ry = y + 22 + i * PITCH;
    const id = classRowId(i);
    const role = roles.get(id) ?? groupRole(i + 1);
    out.push({ kind: 'rect', id, x, y: ry, w: width, h: CELL_H, r: 4, cls: 'live', role });
    const others = p.members[i]!.slice(1).map(w).join(', ');
    out.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + 8,
      y: ry + CELL_H / 2 + 5,
      text: cut(`[${w(rep)}]${others ? `  ${others}` : ''}`, LIST_CHARS),
      size: TEXT,
      mono: true,
    });
    if (p.closed && p.dead === i)
      out.push({
        kind: 'text',
        id: `${id}-dead`,
        x: x + width - 8,
        y: ry + CELL_H / 2 + 5,
        text: 'dead',
        size: TEXT,
        anchor: 'end',
        cls: 'label',
      });
    else if (member(s.lang, rep))
      out.push({
        kind: 'text',
        id: `${id}-in`,
        x: x + width - 8,
        y: ry + CELL_H / 2 + 5,
        text: '∈ L',
        size: TEXT,
        anchor: 'end',
        weight: 'bold',
      });
  });
  return { x, y, w: width, h: 22 + Math.max(1, n) * PITCH - 3 };
}

/** The minimal DFA as it grows: every class and move where the finished one has them. */
function classDiagram(
  out: Shape[],
  p: ClassesPanel,
  s: MnState,
  settings: MnSettings,
  x: number,
  y: number,
  across: boolean,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  title(out, 'dfa-title', p.closed ? 'The minimal DFA' : 'The DFA so far', x, y);
  const names = p.final.reps.map(stateName);
  const a = makeAutomaton({
    states: names,
    alphabet: alphabetOf(s.lang),
    start: names[0]!,
    accept: p.final.reps.filter((r) => member(s.lang, r)).map(stateName),
    moves: p.final.moves.map((m) => ({ from: names[m.from]!, on: m.on, to: names[m.to]! })),
  });
  const hidden =
    settings.dead === 'hide' && p.closed && p.dead !== null ? names[p.dead] : undefined;
  const found = new Set(p.reps.map(stateName));
  const moves = new Set(p.moves.map((m) => `${names[m.from]}|${m.on}|${names[m.to]}`));
  const groups = new Map(roles);
  names.forEach((q, i) => {
    const id = stateId(q, DFA_PREFIX);
    if (!roles.has(id)) groups.set(id, groupRole(i + 1));
  });
  const tight = names.length > 5 ? 0.8 : 1;
  const d = drawAutomaton(a, layoutStates(a, across, tight), {
    prefix: DFA_PREFIX,
    roles: groups,
    show: {
      state: (q) => found.has(q) && q !== hidden,
      move: (m) => moves.has(`${m.from}|${m.on}|${m.to}`) && m.from !== hidden && m.to !== hidden,
    },
  });
  // Keep the room of the whole diagram, so it does not move as it grows.
  const full = drawAutomaton(a, layoutStates(a, across, tight)).bounds;
  out.push(...translate(d.shapes, x - full.x, y + 22 - full.y));
  return { x, y, w: Math.max(full.w, 120), h: 22 + full.h };
}

function statusLine(s: MnState): { text: string; role?: MarkRole } {
  const p = s.panel;
  if (!p) return { text: 'Find classes, tell words apart, or show infinitely many.' };
  if (p.kind === 'classes') {
    if (p.closed) return { text: `closed: ${p.reps.length} classes`, role: 'found' };
    if (p.stopped) return { text: `still growing after ${p.reps.length} classes`, role: 'error' };
    const a = p.at;
    if (!a) return { text: 'ε is the first class' };
    const y = p.reps[a.rep]!;
    return a.suffix === null
      ? { text: `${w(a.word)} ≡ ${w(y)}` }
      : { text: `${w(a.word)} vs ${w(y)}: told apart by ${w(a.suffix)}` };
  }
  if (p.kind === 'apart') {
    if (p.done) {
      const same = Object.values(p.table).some((z) => z === null);
      return same
        ? { text: 'not all apart', role: 'error' }
        : { text: `all apart: at least ${p.words.length} states`, role: 'found' };
    }
    return { text: `${Object.keys(p.table).length} of ${Object.keys(p.all).length} pairs` };
  }
  if (p.done) return { text: 'infinitely many classes: no DFA', role: 'error' };
  return { text: `${p.shown} words, pairwise apart` };
}

function classesBlocks(
  p: ClassesPanel,
  s: MnState,
  settings: MnSettings,
  roles: ReadonlyMap<string, MarkRole>,
  across: boolean,
): Block[] {
  const n = p.final.reps.length;
  const widest = Object.values(p.final.table).map(w);
  return [
    (out, x, y) => classList(out, p, s, x, y, roles),
    (out, x, y) =>
      triangle(out, {
        x,
        y,
        n,
        words: Array.from({ length: n }, (_, i) => p.reps[i]),
        text: (i, j) => {
          const z = p.table[pairKey(i, j)];
          return z === undefined ? undefined : w(z);
        },
        widest,
        roles,
        title: 'Told apart by',
      }),
    ...(s.lang.kind === 'regular'
      ? [
          (out: Shape[], x: number, y: number) =>
            classDiagram(out, p, s, settings, x, y, across, roles),
        ]
      : []),
  ];
}

function apartBlocks(p: ApartPanel, roles: ReadonlyMap<string, MarkRole>): Block[] {
  const cell = (z: string | null | undefined) =>
    z === undefined ? undefined : z === null ? '≡' : w(z);
  return [
    (out, x, y) =>
      triangle(out, {
        x,
        y,
        n: p.words.length,
        words: p.words,
        text: (i, j) => cell(p.table[pairKey(i, j)]),
        widest: Object.values(p.all).map((z) => cell(z)!),
        roles,
        title: 'Told apart by (≡: equivalent)',
      }),
  ];
}

function familyBlocks(p: FamilyPanel, roles: ReadonlyMap<string, MarkRole>): Block[] {
  return [
    (out, x, y) =>
      triangle(out, {
        x,
        y,
        n: p.words.length,
        words: p.words.map((x, i) => (i < p.shown ? x : undefined)),
        text: (i, j) => {
          const z = p.table[pairKey(i, j)];
          return z === undefined ? undefined : w(z);
        },
        widest: p.words.map((x) => w(x.replace(/a/g, 'b'))),
        roles,
        title: 'aⁱ against aʲ: told apart by bⁱ',
      }),
  ];
}

/** Blocks placed in a row, or in a column, or the first ones in a column beside the last. */
function arrange(
  blocks: Block[],
  how: 'row' | 'column' | 'pair-row' | 'pair-column',
): {
  shapes: Shape[];
  bounds: Bounds;
} {
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  const draw = (b: Block, x: number, y: number) => {
    const box = b(shapes, x, y);
    boxes.push(box);
    return box;
  };
  if (how === 'row' || how === 'column' || blocks.length < 3) {
    let at = 0;
    for (const b of blocks) {
      const box = how === 'row' ? draw(b, at, 0) : draw(b, 0, at);
      at = how === 'row' ? beside(box, 30) : below(box, 22);
    }
  } else if (how === 'pair-column') {
    // The first two stacked, the last beside them.
    const a = draw(blocks[0]!, 0, 0);
    const b = draw(blocks[1]!, 0, below(a, 22));
    draw(blocks[2]!, beside(unionBounds(a, b), 30), 0);
  } else {
    // The first two side by side, the last under them.
    const a = draw(blocks[0]!, 0, 0);
    const b = draw(blocks[1]!, beside(a, 30), 0);
    draw(blocks[2]!, 0, below(unionBounds(a, b), 22));
  }
  return { shapes, bounds: unionBounds(...boxes) };
}

export function view(step: Step<MnState, unknown>, settings: MnSettings, stage?: StageSize): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const p = s.panel;
  const head = `L = ${label(s.lang)}`;
  const st = statusLine(s);
  const candidates = (
    p?.kind === 'classes'
      ? ([true, false] as const).flatMap((across) =>
          (['pair-column', 'row', 'pair-row', 'column'] as const).map((how) =>
            arrange(classesBlocks(p, s, settings, roles, across), how),
          ),
        )
      : [
          arrange(
            p?.kind === 'apart'
              ? apartBlocks(p, roles)
              : p?.kind === 'family'
                ? familyBlocks(p, roles)
                : [],
            'column',
          ),
        ]
  ).map((c) => {
    // The language over the picture, and the status line under it.
    const top = 34;
    const shapes: Shape[] = [
      {
        kind: 'text',
        id: 'lang',
        x: 0,
        y: 18,
        text: head,
        size: 17,
        mono: true,
        weight: 'bold',
        role: roles.get('lang'),
      },
      ...translate(c.shapes, -c.bounds.x, top - c.bounds.y),
    ];
    const bodyH = c.shapes.length ? c.bounds.h : 0;
    const sy = top + bodyH + 24;
    shapes.push({
      kind: 'text',
      id:
        p && ((p.kind !== 'classes' && p.done) || (p.kind === 'classes' && (p.closed || p.stopped)))
          ? 'verdict'
          : 'status',
      x: 0,
      y: sy,
      text: st.text,
      size: 15,
      mono: true,
      weight: st.role ? 'bold' : undefined,
      role: roles.get('verdict') ?? roles.get('status') ?? st.role,
    });
    const bounds = unionBounds(
      { x: 0, y: 0, w: textWidth(head, 17, true), h: 26 },
      { x: 0, y: top, w: c.shapes.length ? c.bounds.w : 10, h: bodyH },
      { x: 0, y: sy - 15, w: textWidth(st.text, 15, true), h: 20 },
    );
    return { shapes, bounds };
  });
  const best = pickBest(candidates, stage);
  return { shapes: best.shapes, bounds: padBounds(best.bounds, 14), label: describe(s) };
}
