/**
 * Constrained decoding: the DFA (the current state blue, the moves a token walk takes blue), the
 * text so far as chips with whether it matches, and a table with one row per token.
 *
 * While the index is built (and after, until a token is chosen) the table is the index: one
 * column per state, each cell the state the token ends in from there, or · where it is masked.
 * While choosing a token it is the step: σ(q) for the current state, the model's logit, the
 * logit after the mask (−∞ where masked), and the probabilities as bars (stacked, with the line
 * of u, when sampling).
 *
 * Shape ids, for marks: s-<q> a state, out-<i> a token of the text, w-<token> a row's label,
 * ix<i>-<token> an index cell, a-, l-, m-, p-<token> the step's columns (</s> is "eos").
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { drawAutomaton, layoutStates } from '../../layouts/automaton';
import type { Scene, Shape } from '../../render/scene';
import { round3, short } from '../_lm/numbers';
import { arrange, fromBounds, shift, type Block } from '../_dec2/layout';
import { chip, chipW, CHIP_H, label, textW, title, TITLE_H } from '../_tokenize/draw';
import { logitsAfter, matches, VOCAB } from './fsm';
import {
  describe,
  outId,
  prevOf,
  textOf,
  tokKey,
  type Choice,
  type ConExtra,
  type ConSettings,
  type ConState,
  type Rows,
} from './model';

const GAP = 24;
const WRAP = 360;
const TRACK = 110;
/** Room above the drawing for the zoom buttons, when they cover its corner. */
const DROP = 52;

type Roles = ReadonlyMap<string, MarkRole>;

function dfaBlock(s: ConState, roles: Roles, current: string | null, path: string[]): Block {
  const a = s.c.dfa;
  const used = new Set(path.slice(1).map((q, i) => `${path[i]}>${q}`));
  const d = drawAutomaton(a, layoutStates(a, true), {
    roles,
    look: (q) => (q === current ? 'current' : undefined),
    edge: (p, q) => (used.has(`${p}>${q}`) ? 'used' : undefined),
  });
  const b = fromBounds(d, 0);
  const head = `DFA of ${s.c.text}`;
  const shapes: Shape[] = [];
  title(shapes, 'dfa', head);
  const top = TITLE_H + 8;
  return {
    shapes: [...shapes, ...shift(b.shapes, 0, top)],
    w: Math.max(b.w, textW(head)),
    h: b.h + top,
  };
}

function textBlock(s: ConState, roles: Roles): Block {
  const out: Shape[] = [];
  title(out, 'text', 'text');
  let x = 0;
  let y = TITLE_H;
  const LINE = CHIP_H + 6;
  s.out.forEach((g, i) => {
    const t = VOCAB[g.tok]!;
    const w = chipW(t);
    if (x > 0 && x + w > WRAP) {
      x = 0;
      y += LINE;
    }
    const id = outId(i);
    chip(out, id, x, y, t, roles.get(id) ?? (g.to === null && g.tok !== 0 ? 'error' : undefined));
    x += w + 4;
  });
  if (!s.out.length) label(out, 'text-none', 0, y + CHIP_H / 2 + 5, 'nothing yet', { dim: true });
  const text = textOf(s);
  const ok = matches(s.c.dfa, text);
  const state = s.state === null ? 'off the regex' : `in ${s.state}`;
  const note =
    s.done === 'end'
      ? ok
        ? `"${text}" matches`
        : `"${text}" does not match`
      : s.done === 'stuck'
        ? `stuck ${state}`
        : `${text ? `"${text}", ` : ''}${state}`;
  label(out, 'verdict', 0, y + LINE + 17, note, {
    bold: true,
    role: s.done === 'end' ? (ok ? 'found' : 'error') : s.state === null ? 'error' : undefined,
  });
  return { shapes: out, w: Math.max(WRAP, textW(note)), h: y + LINE + 24 };
}

// ---------------------------------------------------------------------------------------------
// The token table: one row per token, compact enough for all 14 rows on a laptop.

const ROW = 26;
const CELL_H = 22;
const HEAD = 24;
const LABEL_W = 60;
const COL_GAP = 8;
const LANE = 22;

interface CellCol {
  kind: 'cells';
  id: string;
  title: string;
  w: number;
  cell(r: number): { text: string; dim?: boolean; shade?: number } | null;
}

interface BarCol {
  kind: 'bars';
  id: string;
  title: string;
  track: number;
  bar(r: number): { value: number; text: string; offset: number; dim: boolean } | null;
  u?: { value: number; label: string };
}

type Col = CellCol | BarCol;

const colW = (c: Col) => (c.kind === 'cells' ? c.w : c.track + 46);

/** The rows of tokens and the columns side by side, the title above; `lane` keeps room for u. */
function tokenTable(head: string, cols: readonly Col[], roles: Roles, lane: boolean): Block {
  const out: Shape[] = [];
  title(out, 'tab', head);
  const top = TITLE_H + HEAD;
  VOCAB.forEach((t, r) => {
    const id = `w-${tokKey(r)}`;
    label(out, id, LABEL_W - 10, top + r * ROW + CELL_H / 2 + 5, t, {
      anchor: 'end',
      bold: true,
      role: roles.get(id),
    });
  });
  let x = LABEL_W;
  for (const c of cols) {
    label(out, `${c.id}-title`, c.kind === 'cells' ? x + c.w / 2 : x, TITLE_H + 14, c.title, {
      anchor: c.kind === 'cells' ? 'middle' : 'start',
      bold: true,
    });
    VOCAB.forEach((_, r) => {
      const id = `${c.id}-${tokKey(r)}`;
      const y = top + r * ROW;
      if (c.kind === 'cells') {
        const look = c.cell(r);
        out.push({
          kind: 'rect',
          id,
          x,
          y,
          w: c.w - 4,
          h: CELL_H,
          r: 2,
          cls: look ? (look.dim ? 'ghost' : 'live') : undefined,
          shade: look && !look.dim ? look.shade : undefined,
          role: roles.get(id),
        });
        if (look?.text)
          label(out, `${id}-t`, x + (c.w - 4) / 2, y + CELL_H / 2 + 5, look.text, {
            anchor: 'middle',
            dim: look.dim,
          });
      } else {
        const look = c.bar(r);
        const bx = x + (look?.offset ?? 0) * c.track;
        // Never quite 0 wide: a tween starting a frame early would make it negative.
        const w = Math.max(0.5, look ? Math.min(1, look.value) * c.track : 0);
        out.push({
          kind: 'rect',
          id,
          x: bx,
          y: y + 2,
          w,
          h: CELL_H - 4,
          r: 2,
          cls: look?.dim ? 'ghost' : 'live',
          shade: look && !look.dim ? 0.8 : undefined,
          role: roles.get(id),
          opacity: look && look.value > 0 ? 1 : 0,
        });
        if (look?.text)
          out.push({
            kind: 'text',
            id: `${id}-t`,
            x: bx + w + 5,
            y: y + CELL_H / 2 + 5,
            text: look.text,
            size: 15,
            mono: true,
            cls: look.dim ? 'label' : undefined,
          });
      }
    });
    if (c.kind === 'bars') {
      out.push({
        kind: 'arrow',
        id: `${c.id}-axis`,
        x1: x,
        y1: top,
        x2: x,
        y2: top + VOCAB.length * ROW - 4,
        head: 'none',
        opacity: 0.6,
      });
      if (c.u) {
        const ux = x + c.u.value * c.track;
        out.push({
          kind: 'arrow',
          id: `u-${c.id}`,
          x1: ux,
          y1: top - 4,
          x2: ux,
          y2: top + VOCAB.length * ROW,
          head: 'none',
          role: 'active',
        });
        out.push({
          kind: 'text',
          id: `u-${c.id}-t`,
          x: ux,
          y: top + VOCAB.length * ROW + 16,
          text: c.u.label,
          size: 15,
          anchor: 'middle',
          weight: 'bold',
          mono: true,
          role: 'active',
        });
      }
    }
    x += colW(c) + COL_GAP;
  }
  return {
    shapes: out,
    w: Math.max(x - COL_GAP, textW(head)),
    h: top + VOCAB.length * ROW + (lane ? LANE : 0),
  };
}

const endCell = (r: number, to: string | null | undefined) => {
  if (to === undefined) return null;
  if (to === null) return { text: '·', dim: true };
  return { text: r === 0 ? 'end' : to, shade: 0.35 };
};

function indexBlock(s: ConState, rows: Rows, roles: Roles): Block {
  const cols: Col[] = s.c.dfa.states.map((q, i) => ({
    kind: 'cells',
    id: `ix${i}`,
    title: q,
    w: 46,
    cell: (r) => endCell(r, rows.get(q)?.[r]),
  }));
  return tokenTable('index σ: where each token ends', cols, roles, false);
}

function choiceBlock(c: Choice, roles: Roles, mask: boolean, sample: boolean): Block {
  const allowed = c.allowed;
  const hasP = c.p.length > 0;
  const stretch: number[] = [];
  let cum = 0;
  for (const v of c.p) {
    stretch.push(cum);
    cum += v;
  }
  const cols: Col[] = [
    {
      kind: 'cells',
      id: 'a',
      title: c.from && mask ? `σ(${c.from})` : 'σ',
      w: 56,
      cell: (r) => (allowed ? endCell(r, allowed[r]) : { text: '', dim: true }),
    },
    { kind: 'cells', id: 'l', title: 'logit', w: 52, cell: (r) => ({ text: short(c.logits[r]!) }) },
    {
      kind: 'cells',
      id: 'm',
      title: 'masked',
      w: 60,
      cell: (r) =>
        allowed || !mask ? { text: short(c.masked[r]!), dim: c.masked[r] === -Infinity } : null,
    },
    {
      kind: 'bars',
      id: 'p',
      title: 'p',
      track: TRACK,
      bar: (r) =>
        hasP
          ? {
              value: c.p[r]!,
              text: c.p[r]! > 0 ? short(c.p[r]!) : '0',
              dim: c.p[r] === 0,
              offset: c.u !== null ? stretch[r]! : 0,
            }
          : null,
      u: c.u !== null && hasP ? { value: c.u, label: `u = ${round3(c.u)}` } : undefined,
    },
  ];
  const head = `next token after ${c.prev === '<s>' ? 'the prompt' : `"${c.prev}"`}`;
  return tokenTable(head, cols, roles, sample);
}

export function view(
  step: Step<ConState, ConExtra>,
  settings: ConSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const w = step.extra?.work;
  const choice: Choice | undefined = w?.choice ?? (w?.stage === 'index' ? undefined : s.last);
  const showIndex = w?.stage === 'index' || (!choice && s.index !== null && !w);
  const current = w?.stage === 'index' ? (w.q ?? null) : (choice?.from ?? s.state);
  const dfa = dfaBlock(s, roles, current, w?.path ?? []);
  const text = textBlock(s, roles);
  let table: Block;
  if (showIndex) table = indexBlock(s, w?.rows ?? s.index!, roles);
  else
    table = choiceBlock(
      choice ?? {
        prev: prevOf(s),
        from: s.state,
        logits: logitsAfter(prevOf(s)),
        allowed: s.index && s.state ? s.index.get(s.state)! : null,
        masked: logitsAfter(prevOf(s)),
        p: [],
        u: null,
        pick: -1,
      },
      roles,
      settings.mask,
      settings.decode === 'sample',
    );
  const drop = stage?.strip ? 0 : DROP;
  const options = [
    // Laptop: the table on the left, the DFA and the text on the right, clear of the buttons.
    arrange([
      { b: table, x: 0, y: 0 },
      { b: dfa, x: table.w + GAP, y: drop },
      { b: text, x: table.w + GAP, y: drop + dfa.h + GAP },
    ]),
    // Phone: one under another.
    arrange([
      { b: dfa, x: 0, y: drop },
      { b: text, x: 0, y: drop + dfa.h + GAP },
      { b: table, x: 0, y: drop + dfa.h + GAP + text.h + GAP },
    ]),
  ];
  const best = pickLayout(stage, options);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}
