/**
 * LR(0): the numbered rules (rule 0 is S' → S); while the item sets are built, the LR(0)
 * automaton (states I0, I1, … where they will sit in the finished diagram) and the items of the
 * state in focus, kernel items bold; then the ACTION and GOTO table (a cell with two actions is
 * red); during a parse, the input and the stack of states with the symbols between them.
 * Blocks are packed in rows and `bestPlacement` keeps the packing drawn largest.
 *
 * Shape ids: rules `rn-<k>`, `rn-title`; automaton `s-I<k>`, `m-I<i>-I<j>` (layouts/automaton);
 * items `it-<k>`, `it-title`; table `a-<i>-<a>`, `g-<i>-<A>`; input `in-<i>`; stack `st-<k>`.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { drawAutomaton, layoutStates } from '../../layouts/automaton';
import { pickBest, translate } from '../../layouts/arrange';
import { padBounds, textWidth, unionBounds } from '../../layouts/graph';
import { drawTape } from '../../layouts/tape';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { Automaton } from '../_automata/automaton';
import { BUTTONS_DROP, bestPlacement, type Placement } from '../_grammar/draw';
import { formText, type Grammar } from '../_grammar/grammar';
import {
  END,
  actText,
  actionId,
  build,
  describe,
  gotoId,
  itemId,
  itemText,
  ruleNumId,
  stackId,
  stateName,
  terminalsOf,
  type Lr0Settings,
  type Lr0State,
} from './model';

type LStep = Step<Lr0State, unknown>;

const TEXT = 15;
const ROW_H = 28;

function text(
  out: Shape[],
  id: string,
  x: number,
  y: number,
  t: string,
  o: Partial<Extract<Shape, { kind: 'text' }>> = {},
) {
  out.push({ kind: 'text', id, x, y, text: t, size: TEXT, ...o });
}

const finals = new WeakMap<Grammar, Map<string, Lr0State>>();
/** The finished construction, for the diagram's layout and the table's size. */
function finished(s: Lr0State, settings: Lr0Settings): Lr0State {
  if (s.phase === 'ready') return s;
  let m = finals.get(s.grammar);
  if (!m) finals.set(s.grammar, (m = new Map()));
  let f = m.get(settings.method);
  if (!f) m.set(settings.method, (f = build(s.grammar, settings.method)));
  return f;
}

function drawRulesList(out: Shape[], s: Lr0State, roles: ReadonlyMap<string, MarkRole>): Bounds {
  text(out, 'rn-title', 0, 14, 'Rules', { cls: 'label', role: roles.get('rn-title') });
  let w = textWidth('Rules', TEXT);
  s.rules.forEach((r, k) => {
    const id = ruleNumId(k);
    const t = `${k}  ${r.lhs} → ${formText(r.rhs)}`;
    const role = roles.get(id);
    text(out, id, 0, 24 + (k + 1) * 22 - 4, t, {
      mono: true,
      role,
      weight: role ? 'bold' : undefined,
    });
    w = Math.max(w, textWidth(t, TEXT, true));
  });
  return { x: 0, y: 0, w, h: 24 + s.rules.length * 22 + 6 };
}

function automatonOf(s: Lr0State): Automaton {
  const states = s.sets.map((_, i) => stateName(i));
  return {
    states,
    alphabet: [],
    start: 'I0',
    accept: [],
    moves: s.edges.map((e) => ({ from: stateName(e.from), to: stateName(e.to), on: e.sym })),
  };
}

function drawDiagram(
  out: Shape[],
  s: Lr0State,
  settings: Lr0Settings,
  roles: ReadonlyMap<string, MarkRole>,
  across: boolean,
): Bounds {
  const f = finished(s, settings);
  const whole = automatonOf(f);
  const built = new Set(s.sets.map((_, i) => stateName(i)));
  const edges = new Set(s.edges.map((e) => `${e.from} ${e.sym}`));
  const d = drawAutomaton(whole, layoutStates(whole, across), {
    roles,
    look: (q) => (q === stateName(s.focus) ? 'current' : undefined),
    show: {
      state: (q) => built.has(q),
      move: (m) => edges.has(`${m.from.slice(1)} ${m.on}`),
    },
  });
  out.push(...translate(d.shapes, -d.bounds.x, -d.bounds.y));
  return { x: 0, y: 0, w: d.bounds.w, h: d.bounds.h };
}

function drawItems(
  out: Shape[],
  s: Lr0State,
  settings: Lr0Settings,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const f = finished(s, settings);
  const set = s.sets[s.focus] ?? [];
  const kernel = s.kernels[s.focus] ?? set.length;
  const title = `Items of ${stateName(s.focus)}`;
  text(out, 'it-title', 0, 14, title, { cls: 'label' });
  set.forEach((it, k) => {
    const id = itemId(k);
    const role = roles.get(id) ?? (it.dot === s.rules[it.rule]!.rhs.length ? 'done' : undefined);
    text(out, id, 0, 24 + (k + 1) * 22 - 4, itemText(s.rules, it), {
      mono: true,
      weight: k < kernel ? 'bold' : undefined,
      role,
    });
  });
  const most = Math.max(...f.sets.map((x) => x.length), 1);
  const widest = Math.max(
    ...f.sets.flat().map((it) => textWidth(itemText(s.rules, it), TEXT, true)),
    textWidth(title, TEXT),
  );
  return { x: 0, y: 0, w: widest, h: 24 + most * 22 + 6 };
}

function drawTable(
  out: Shape[],
  s: Lr0State,
  settings: Lr0Settings,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const f = finished(s, settings);
  const g = s.grammar;
  const terms = terminalsOf(g);
  const varsCols = g.variables;
  const n = f.sets.length;
  const cellText = (i: number, c: string, isGoto: boolean) => {
    if (i >= s.rows) return '';
    if (isGoto) return s.goto[i]?.[c] !== undefined ? String(s.goto[i]![c]) : '';
    return (s.action[i]?.[c] ?? []).map(actText).join('/');
  };
  const fullText = (i: number, c: string, isGoto: boolean) =>
    isGoto
      ? f.goto[i]?.[c] !== undefined
        ? String(f.goto[i]![c])
        : ''
      : (f.action[i]?.[c] ?? []).map(actText).join('/');
  const cols = [
    ...terms.map((c) => ({ c, goto: false })),
    ...varsCols.map((c) => ({ c, goto: true })),
  ];
  const widths = cols.map(({ c, goto }) =>
    Math.max(
      36,
      ...Array.from({ length: n }, (_, i) => textWidth(fullText(i, c, goto), TEXT, true) + 12),
    ),
  );
  const headW = 34;
  const gap = 10;
  const title = s.conflicts.length
    ? `ACTION | GOTO: ${s.conflicts.length} conflict${s.conflicts.length === 1 ? '' : 's'}`
    : 'ACTION | GOTO';
  text(out, 'tb-title', 0, 14, title, { cls: 'label' });
  const top = 50;
  let x = headW;
  const xs: number[] = [];
  cols.forEach(({ c, goto }, k) => {
    if (goto && k > 0 && !cols[k - 1]!.goto) x += gap;
    xs.push(x);
    text(out, `tb-h-${k}`, x + widths[k]! / 2, top - 8, c, {
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      cls: 'label',
    });
    x += widths[k]!;
  });
  const conflict = new Set(s.conflicts.map((c) => actionId(c.state, c.sym)));
  for (let i = 0; i < n; i++) {
    const y = top + i * ROW_H;
    text(out, `tb-r-${i}`, 0, y + ROW_H / 2 + 5, String(i), {
      weight: 'bold',
      mono: true,
      cls: 'label',
    });
    cols.forEach(({ c, goto }, k) => {
      const id = goto ? gotoId(i, c) : actionId(i, c);
      const t = cellText(i, c, goto);
      const role = roles.get(id) ?? (conflict.has(id) ? 'error' : undefined);
      out.push({
        kind: 'rect',
        id,
        x: xs[k]!,
        y,
        w: widths[k]! - 3,
        h: ROW_H - 3,
        r: 4,
        cls: t ? 'live' : undefined,
        role,
      });
      if (t)
        text(out, `${id}-t`, xs[k]! + (widths[k]! - 3) / 2, y + ROW_H / 2 + 4, t, {
          anchor: 'middle',
          mono: true,
          role,
          weight: role ? 'bold' : undefined,
        });
    });
  }
  return { x: 0, y: 0, w: Math.max(x, textWidth(title, TEXT)), h: top + n * ROW_H };
}

const BOX_W = 34;
const BOX_H = 32;

function drawParse(out: Shape[], s: Lr0State, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const run = s.run!;
  const cells = [...run.word, END];
  text(out, 'in-title', 0, 14, 'Input', { cls: 'label' });
  const tb = drawTape(out, {
    id: 'in',
    x: 0,
    y: 22,
    cells,
    to: cells.length,
    head: run.verdict ? null : run.pos,
    headRoom: 'none',
    read: run.pos,
    roles,
  });
  const top = 22 + tb.h + 18;
  text(out, 'st-title', 0, top + 14, 'Stack: states, and the symbols between them', {
    cls: 'label',
  });
  const y = top + 24;
  let x = 0;
  run.states.forEach((q, k) => {
    if (k > 0) {
      const sym = run.syms[k - 1]!;
      const sw = Math.max(BOX_W - 8, textWidth(sym, 17, true) + 10);
      text(out, `st-${k}-sym`, x + sw / 2, y + BOX_H / 2 + 6, sym, {
        size: 17,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
      });
      x += sw;
    }
    const id = stackId(k);
    const role =
      roles.get(id) ?? (k === run.states.length - 1 && !run.verdict ? 'active' : undefined);
    const w = Math.max(BOX_W, textWidth(String(q), 17, true) + 12);
    out.push({ kind: 'rect', id, x, y, w, h: BOX_H, r: 6, cls: 'live', role });
    text(out, `${id}-t`, x + w / 2, y + BOX_H / 2 + 6, String(q), {
      size: 17,
      anchor: 'middle',
      mono: true,
      role,
    });
    x += w + 2;
  });
  const reserve = run.longest * (BOX_W + 30);
  return {
    x: 0,
    y: 0,
    w: Math.max(tb.w, reserve, textWidth('Stack: states, and the symbols between them', TEXT)),
    h: y + BOX_H,
  };
}

function rowPackings(sizes: readonly { w: number; h: number }[], gap: number): Placement[] {
  const n = sizes.length;
  const out: Placement[] = [];
  for (let mask = 0; mask < 1 << (n - 1); mask++) {
    const at: Placement = [];
    let x = 0;
    let y = 0;
    let rowH = 0;
    let firstRow = true;
    sizes.forEach((b, i) => {
      if (i > 0 && mask & (1 << (i - 1))) {
        y += rowH + gap;
        x = 0;
        rowH = 0;
        firstRow = false;
      }
      const drop = firstRow && x > 0 ? BUTTONS_DROP : 0;
      at.push({ x, y: y + drop });
      x += b.w + gap;
      rowH = Math.max(rowH, b.h + drop);
    });
    out.push(at);
  }
  if (n >= 3) {
    const right = sizes[0]!.w + gap;
    let y = BUTTONS_DROP;
    out.push(
      sizes.map((b, i) => {
        if (i === 0) return { x: 0, y: 0 };
        const at = { x: right, y };
        y += b.h + gap;
        return at;
      }),
    );
  }
  return out;
}

export function view(step: LStep, settings: Lr0Settings, stage?: StageSize): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const options: { shapes: Shape[]; bounds: Bounds }[] = [];
  const arrange = (draws: ((o: Shape[]) => Bounds)[]) => {
    const blocks = draws.map((d) => {
      const shapes: Shape[] = [];
      return { shapes, box: d(shapes) };
    });
    const sizes = blocks.map((b) => b.box);
    const places = bestPlacement(sizes, rowPackings(sizes, 28), stage);
    const shapes: Shape[] = [];
    const boxes: Bounds[] = [];
    blocks.forEach((b, k) => {
      const at = places[k]!;
      shapes.push(...translate(b.shapes, at.x - b.box.x, at.y - b.box.y));
      boxes.push({ ...b.box, x: at.x, y: at.y });
    });
    options.push({ shapes, bounds: padBounds(unionBounds(...boxes), 10) });
  };
  const rules = (o: Shape[]) => drawRulesList(o, state, roles);
  const table = (o: Shape[]) => drawTable(o, state, settings, roles);
  if (state.run) arrange([(o) => drawParse(o, state, roles), table, rules]);
  else if (state.phase === 'items' || state.phase === 'typed') {
    arrange([
      (o) => drawDiagram(o, state, settings, roles, true),
      (o) => drawItems(o, state, settings, roles),
      rules,
    ]);
    arrange([
      (o) => drawDiagram(o, state, settings, roles, false),
      (o) => drawItems(o, state, settings, roles),
      rules,
    ]);
  } else arrange([table, (o) => drawItems(o, state, settings, roles), rules]);
  return { ...pickBest(options, stage), label: describe(state) };
}
