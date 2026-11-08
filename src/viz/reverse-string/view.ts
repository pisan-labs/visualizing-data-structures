import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import {
  callStackHeight,
  callTreeBounds,
  drawCallStack,
  drawCallTree,
  frameWidth,
  layoutCallTree,
  padBounds,
  unionBounds,
  type CallState,
  type StackFrame,
  type TreeCall,
} from '../../layouts/calls';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  callText,
  describe,
  quote,
  type Phase,
  type RevCall,
  type RevSettings,
  type RevState,
  type Variant,
} from './model';

const SIZE = 12.5;
/** The chain's boxes, at the stack's font, the value under the call. */
const TREE = { size: SIZE, levelGap: 38, gap: 10 };
const GAP = 26;
const CELL = { w: 30, h: 30, pitch: 33 };
const MIN_ROOM = 4;

const treeLabel = (c: RevCall, text: string, v: Variant) =>
  v === 'rest' ? quote(text.slice(c.i)) : `(${c.i}, ${c.j})`;

/** What a frame shows on its line, for each phase of its call. */
function lineText(c: RevCall, phase: Phase, s: RevState, text: string, v: Variant): string {
  if (v === 'rest') {
    switch (phase) {
      case 'start':
        return '→ if length(s) <= 1';
      case 'check':
        return '→ length(s) <= 1? no';
      case 'wait':
        return `waits: ${callText({ i: c.i + 1, j: c.j }, text, v)} + ${quote(text[c.i]!)}`;
      case 'got':
        return `${quote(s.got[c.id]!)} + ${quote(text[c.i]!)}`;
      case 'return':
        return `return ${quote(s.result[c.id]!)}`;
      default:
        return '';
    }
  }
  switch (phase) {
    case 'start':
      return '→ if i >= j';
    case 'check':
      return `→ ${c.i} >= ${c.j}? no`;
    case 'swap':
      return `swap A[${c.i}], A[${c.j}]`;
    case 'wait':
      return `waits: ${callText({ i: c.i + 1, j: c.j - 1 }, text, v)}`;
    case 'return':
      return 'return';
    default:
      return '';
  }
}

function mainLine(s: RevState, v: Variant): string {
  const run = s.run;
  if (!run) return 'no call yet';
  const first = s.calls[0]!;
  if (run.outcome === 'running')
    return v === 'rest'
      ? `waits: r = ${callText(first, run.text, v)}`
      : `waits: ${callText(first, run.text, v)}`;
  return v === 'rest' ? `r = ${quote(run.value!)}` : `A is ${quote(run.value!)}`;
}

/** The frame size for a whole run, from every text its frames will show. */
function frameSize(s: RevState, v: Variant, rows: 1 | 2) {
  const text = s.run?.text ?? '';
  const heads = [{ call: 'main' }, ...s.calls.map((c) => ({ call: callText(c, text, v) }))];
  const lines = ['no call yet'];
  const tokenLines: [string, string][] = [];
  const fake = { got: {}, result: {} } as unknown as RevState;
  for (const c of s.calls) {
    for (const p of ['start', 'check', 'swap', 'wait'] as Phase[])
      lines.push(lineText(c, p, fake, text, v));
    if (v === 'swap') lines.push('return');
    if (c.returns !== null) {
      tokenLines.push([`return ${quote(c.returns)}`, quote(c.returns)]);
      const child = s.calls[c.id];
      if (child?.returns != null)
        tokenLines.push([`${quote(child.returns)} + ${quote(text[c.i]!)}`, quote(child.returns)]);
    }
  }
  if (s.run) {
    const first = s.calls[0]!;
    lines.push(`waits: r = ${callText(first, text, v)}`, `A is ${quote(text)}`);
    if (first.returns !== null)
      tokenLines.push([`r = ${quote(first.returns)}`, quote(first.returns)]);
  }
  return frameWidth(heads, lines, tokenLines, SIZE, rows);
}

export function view(
  step: Step<RevState, undefined>,
  settings: RevSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const v = settings.variant;
  const text = s.run?.text ?? s.cells.map((c) => c.ch).join('');
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const onStack = new Set(s.stack);
  const top = s.stack[s.stack.length - 1];
  const topCall = top === undefined ? undefined : s.calls[top - 1];

  // The call tree: a chain, laid out finished.
  const valueOf = (c: RevCall, done: boolean): string | undefined => {
    if (v === 'rest') return done ? `= ${quote(c.returns!)}` : undefined;
    if (!done || c.i >= c.j) return undefined;
    return `${text[c.i]}↔${text[c.j]}`;
  };
  const layout = layoutCallTree(
    s.calls.map((c) => ({
      id: String(c.id),
      parent: c.parent === null ? null : String(c.parent),
      label: treeLabel(c, text, v),
      value: valueOf(c, true),
      state: 'done',
    })),
    TREE,
  );
  const stateOf = (c: RevCall): CallState =>
    c.id === top ? 'current' : onStack.has(c.id) ? 'open' : 'done';
  const now: TreeCall[] = s.calls.slice(0, s.made).map((c) => ({
    id: String(c.id),
    parent: c.parent === null ? null : String(c.parent),
    label: treeLabel(c, text, v),
    value: valueOf(c, v === 'rest' ? s.result[c.id] !== undefined : s.swapped.includes(c.id)),
    state: stateOf(c),
  }));
  const treeW = Math.max(84, layout.bounds.w);
  const treeTop = 30;
  const dx = -layout.bounds.x + (treeW - layout.bounds.w) / 2;
  const dy = treeTop - layout.bounds.y;
  const treeBox: Bounds =
    s.calls.length > 0 ? callTreeBounds(layout, dx, dy) : { x: 0, y: treeTop, w: treeW, h: 24 };
  const run = s.run;
  const cellsTop = 8;
  const labelW = 26;
  const cellsH = CELL.h + 18 + (v === 'swap' ? 30 : 0);
  const cellsW = labelW + Math.max(4, s.cells.length) * CELL.pitch;
  const room = Math.max(MIN_ROOM, run?.room ?? 0);
  // The stack's frames hold their line on the call's row (the usual), or on a second row, which
  // makes the stack narrow enough for a phone. Decided from the whole run's texts.
  const arrangement = (rows: 1 | 2) => {
    const size = frameSize(s, v, rows);
    const width = Math.max(size.width, cellsW);
    const right = treeW + GAP;
    const stackTop = cellsTop + cellsH + 8;
    const bounds = padBounds(
      unionBounds(
        treeBox,
        { x: 0, y: 0, w: treeW, h: 30 },
        { x: right, y: 0, w: width, h: cellsTop + cellsH },
        { x: right, y: stackTop, w: width, h: callStackHeight(room, SIZE, rows) },
      ),
      12,
    );
    return { rows, size, width, right, stackTop, bounds };
  };
  const place = pickLayout(stage, [arrangement(1), arrangement(2)]);
  shapes.push({
    kind: 'text',
    id: 'tree-title',
    x: 0,
    y: 17,
    text: 'call tree',
    size: 13,
    cls: 'label',
    mono: true,
  });
  if (s.made === 0) {
    shapes.push({
      kind: 'text',
      id: 'tree-empty',
      x: 0,
      y: treeTop + 18,
      text: '(no calls yet)',
      size: 11.5,
      cls: 'label',
      mono: true,
    });
  }
  shapes.push(...drawCallTree(layout, now, { dx, dy, roles }));

  // The characters: the string s (rest), or the array A that the swaps change (swap).
  const right = place.right;
  const cx = (i: number) => right + labelW + i * CELL.pitch;
  shapes.push({
    kind: 'text',
    id: 'cells-name',
    x: right,
    y: cellsTop + CELL.h / 2 + 5,
    text: v === 'rest' ? 's' : 'A',
    size: 15,
    cls: 'label',
    mono: true,
  });
  const lo = topCall?.i ?? -1;
  const hi = topCall ? (v === 'rest' ? text.length - 1 : topCall.j) : -1;
  // Swap version: ends that have been swapped are in their final places.
  const swappedTo = new Set<number>();
  for (const id of s.swapped) {
    const c = s.calls[id - 1]!;
    swappedTo.add(c.i).add(c.j);
  }
  s.cells.forEach((cell, i) => {
    const id = `cell-${i}`;
    let role: MarkRole | undefined = roles.get(id);
    if (!role && s.run?.outcome === 'running') {
      if (v === 'swap' && swappedTo.has(i)) role = 'done';
      else if (i >= lo && i <= hi) role = 'visit';
    }
    shapes.push({
      kind: 'rect',
      id,
      x: cx(i),
      y: cellsTop,
      w: CELL.w,
      h: CELL.h,
      r: 5,
      cls: 'live',
      role,
    });
    shapes.push({
      kind: 'text',
      id: `ch-${cell.uid}`,
      x: cx(i) + CELL.w / 2,
      y: cellsTop + CELL.h / 2 + 6,
      text: cell.ch,
      size: 17,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: role === 'active' ? 'active' : undefined,
    });
    shapes.push({
      kind: 'text',
      id: `idx-${i}`,
      x: cx(i) + CELL.w / 2,
      y: cellsTop + CELL.h + 14,
      text: String(i),
      size: 11,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
  });
  if (s.cells.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'cells-empty',
      x: right + labelW,
      y: cellsTop + CELL.h / 2 + 5,
      text: '(nothing yet)',
      size: 11.5,
      cls: 'label',
      mono: true,
    });
  }
  if (v === 'swap' && topCall && s.run?.outcome === 'running') {
    // The top frame's i and j, under their cells. When they meet, j sits under i.
    const meet = topCall.i === topCall.j;
    for (const [name, at, row] of [
      ['i', topCall.i, 0],
      ['j', topCall.j, meet ? 1 : 0],
    ] as const) {
      const x = Math.max(0, Math.min(s.cells.length - 1, at));
      shapes.push({
        kind: 'text',
        id: `ptr-${name}`,
        x: cx(x) + CELL.w / 2 + (at < 0 ? -CELL.pitch : at >= s.cells.length ? CELL.pitch : 0),
        y: cellsTop + CELL.h + 30 + row * 14,
        text: name,
        size: 13,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        cls: 'pointer',
        role: roles.get(`ptr-${name}`) ?? 'active',
      });
    }
  }

  // The call stack, main at the bottom.
  const frames: StackFrame[] = [
    {
      id: 'main',
      call: 'main',
      line: mainLine(s, v),
      status: 'caller',
      received:
        run?.outcome === 'done' && v === 'rest'
          ? { from: String(s.calls[0]!.id), value: quote(run.value!) }
          : undefined,
    },
  ];
  for (const id of s.stack) {
    const c = s.calls[id - 1]!;
    const phase = s.phase[id] ?? 'start';
    const child = s.calls[id];
    frames.push({
      id: String(id),
      call: callText(c, text, v),
      line: lineText(c, phase, s, text, v),
      status: id !== top ? 'waiting' : phase === 'return' ? 'returning' : 'running',
      returns: phase === 'return' && v === 'rest' ? quote(s.result[id]!) : undefined,
      received:
        phase === 'got' && child ? { from: String(child.id), value: quote(s.got[id]!) } : undefined,
    });
  }
  const { size, width, stackTop } = place;
  // Before the first call main sits right under the title (so a still picture is tight); the
  // framing keeps the room either way.
  const stack = drawCallStack(frames, {
    x: right,
    y: stackTop,
    width,
    room: run ? room : 1,
    lineX: size.lineX,
    rows: place.rows,
    size: SIZE,
    roles,
  });
  shapes.push(...stack.shapes);
  return { shapes, bounds: place.bounds, label: describe(s, settings) };
}
