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
  baseTest,
  callText,
  describe,
  type FactCall,
  type FactSettings,
  type FactState,
  type Phase,
} from './model';

const SIZE = 12.5;
/**
 * The chain's boxes, at the stack's font. Two lines (the value under the call) keep the chain
 * narrow for a phone; one line (the value after it) keeps a long chain no taller than the stack
 * beside it, for a wide, short laptop stage.
 */
const TWO_LINES = (calls: number) => ({ size: SIZE, levelGap: calls > 6 ? 40 : 44, gap: 10 });
const ONE_LINE = { size: SIZE, levelGap: 30, gap: 10, twoLines: false };
const GAP = 26;
/** Keep at least this many stack slots, so a short run is not blown up to fill the stage. */
const MIN_ROOM = 5;

/** The tree's short label for a call: fact(4) or fact(4, 6). */
const treeLabel = (c: FactCall) => (c.acc === null ? `fact(${c.n})` : `fact(${c.n}, ${c.acc})`);

const startLine = (c: FactCall, st: FactSettings) =>
  st.base !== 'none'
    ? `→ if ${baseTest(st.base)}`
    : c.acc !== null
      ? '→ return factorial(n - 1, n * acc)'
      : '→ return n * factorial(n - 1)';

const waitLine = (c: FactCall) =>
  c.acc !== null
    ? `waits: factorial(${c.n - 1}, ${c.n * c.acc})`
    : `waits: ${c.n} * factorial(${c.n - 1})`;

const gotLine = (c: FactCall, got: number) =>
  c.acc !== null ? `got ${got}: return it` : `${c.n} * ${got}`;

const FAILED = '✗ no room: overflow';

/** What a frame shows on its line, for each phase of its call. */
function lineText(c: FactCall, phase: Phase, s: FactState, st: FactSettings): string {
  switch (phase) {
    case 'start':
      return startLine(c, st);
    case 'check':
      return `→ ${baseTest(st.base)}? no`;
    case 'wait':
      return waitLine(c);
    case 'got':
      return gotLine(c, s.got[c.id]!);
    case 'return':
      return `return ${s.result[c.id]}`;
    case 'failed':
      return FAILED;
    default:
      return '';
  }
}

const MAIN_LINES = ['no call yet', '✗ stack overflow', '✗ stopped: no end'];

function mainLine(s: FactState): string {
  const run = s.run;
  if (!run) return MAIN_LINES[0]!;
  if (run.outcome === 'running') return `waits: x = factorial(${run.n})`;
  if (run.outcome === 'done') return `x = ${run.value}`;
  return run.outcome === 'overflow' ? MAIN_LINES[1]! : MAIN_LINES[2]!;
}

/** The frame size for a whole run, from every text its frames will show. */
function frameSize(s: FactState, st: FactSettings) {
  const heads = [{ call: 'main' }, ...s.calls.map((c) => ({ call: callText(c) }))];
  const lines = [...MAIN_LINES, `waits: x = factorial(${s.run?.n ?? 0})`, FAILED];
  const tokenLines: [string, string][] = [];
  s.calls.forEach((c, i) => {
    lines.push(startLine(c, st), `→ ${baseTest(st.base)}? no`, waitLine(c));
    if (c.returns === null) return;
    const v = String(c.returns);
    tokenLines.push([`return ${v}`, v], [`x = ${v}`, v]);
    const child = s.calls[i + 1];
    if (child?.returns != null) tokenLines.push([gotLine(c, child.returns), String(child.returns)]);
  });
  return frameWidth(heads, lines, tokenLines, SIZE);
}

export function view(
  step: Step<FactState, undefined>,
  settings: FactSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const onStack = new Set(s.stack.map((f) => f.call));
  const top = s.stack[s.stack.length - 1]?.call;

  // The call tree, for factorial a chain, laid out finished so it never moves as it grows.
  const finished: TreeCall[] = s.calls.map((c) => ({
    id: String(c.id),
    parent: c.parent === null ? null : String(c.parent),
    label: treeLabel(c),
    value: c.returns === null ? undefined : `= ${c.returns}`,
    state: 'done',
  }));
  const stateOf = (c: FactCall): CallState => {
    if (s.phase[c.id] === 'failed') return 'error';
    if (c.id === top) return 'current';
    return onStack.has(c.id) ? 'open' : 'done';
  };
  const now: TreeCall[] = s.calls.slice(0, s.made).map((c) => ({
    id: String(c.id),
    parent: c.parent === null ? null : String(c.parent),
    label: treeLabel(c),
    value: s.result[c.id] === undefined ? undefined : `= ${s.result[c.id]}`,
    state: stateOf(c),
  }));
  const treeTop = 30;
  const { width, lineX } = frameSize(s, settings);
  const run = s.run;
  const room = Math.max(MIN_ROOM, run?.room ?? 0);
  // Decided from the finished chain and the reserved stack, so it holds for the whole run.
  // The stack sits beside the chain or, for a narrow phone stage, under it.
  const arrangement = (opts: Parameters<typeof layoutCallTree>[1], under = false) => {
    const layout = layoutCallTree(finished, opts);
    const treeW = Math.max(96, layout.bounds.w);
    const dx = -layout.bounds.x + (treeW - layout.bounds.w) / 2;
    const dy = treeTop - layout.bounds.y;
    const treeBox: Bounds =
      s.calls.length > 0 ? callTreeBounds(layout, dx, dy) : { x: 0, y: treeTop, w: treeW, h: 24 };
    const stackX = under ? 0 : treeW + GAP;
    const stackY = under ? treeBox.y + treeBox.h + GAP : 0;
    const bounds = padBounds(
      unionBounds(
        treeBox,
        { x: 0, y: 0, w: treeW, h: 30 },
        { x: stackX, y: stackY, w: width, h: callStackHeight(room, SIZE) },
      ),
      12,
    );
    return { layout, dx, dy, stackX, stackY, bounds };
  };
  const { layout, dx, dy, stackX, stackY, bounds } = pickLayout(stage, [
    arrangement(TWO_LINES(s.calls.length)),
    arrangement(ONE_LINE),
    arrangement(TWO_LINES(s.calls.length), true),
  ]);
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

  // The call stack, main at the bottom and the newest frame on top.
  const frames: StackFrame[] = [
    {
      id: 'main',
      call: 'main',
      line: mainLine(s),
      status: run && (run.outcome === 'overflow' || run.outcome === 'loop') ? 'error' : 'caller',
      received:
        run?.outcome === 'done' && run.from !== null
          ? { from: String(run.from), value: String(run.value) }
          : undefined,
    },
  ];
  for (const f of s.stack) {
    const c = s.calls[f.call - 1]!;
    const phase = s.phase[c.id] ?? 'start';
    const child = s.calls[c.id];
    const status: StackFrame['status'] =
      phase === 'failed'
        ? 'error'
        : c.id !== top
          ? 'waiting'
          : phase === 'return'
            ? 'returning'
            : 'running';
    frames.push({
      id: String(f.frame),
      callId: String(c.id),
      call: callText(c),
      line: lineText(c, phase, s, settings),
      status,
      returns: phase === 'return' ? String(s.result[c.id]) : undefined,
      received:
        phase === 'got' && child
          ? { from: String(child.id), value: String(s.got[c.id]) }
          : undefined,
    });
  }
  // Before the first call main sits right under the title (so a still picture is tight); the
  // framing keeps the room either way.
  const stack = drawCallStack(frames, {
    x: stackX,
    y: stackY,
    width,
    room: run ? room : 1,
    lineX,
    size: SIZE,
    roles,
  });
  shapes.push(...stack.shapes);
  return { shapes, bounds, label: describe(s) };
}
