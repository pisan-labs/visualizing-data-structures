/**
 * The drawing: what is asked at the top left, then the list as a chain of [value | next] nodes
 * (src/layouts/linked.ts). While the pattern runs, a dummy node sits in front; before, kth and
 * after are drawn above the nodes, prev and cur below. Nodes keep their slots while a group is
 * turned around, so its arrows point back (the nodes are flipped to keep them short); once the
 * group is linked in, the list is redrawn in its new order and the nodes slide into place. The
 * naive approach draws the array of copies (vals) under the list.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { drawChain, type ChainLink, type ChainNode, type NamedPointer } from '../../layouts/linked';
import type { Scene, Shape } from '../../render/scene';
import { ARRAY, arrows, chainCols, drawArray, heading, nid, rerouteSkips } from '../_lists2/kit';
import { DUMMY, values, type RKExtra, type RKSettings, type RKState } from './model';

const ABOVE = ['before', 'kth', 'after'];
const BELOW = ['prev', 'cur'];
const ARRAY_X = 70;
const ARRAY_ROOM = ARRAY.h + ARRAY.below + 24;

export function view(
  step: Step<RKState, RKExtra>,
  _settings: RKSettings,
  stage?: StageSize,
): Scene {
  const { state, extra } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const slot = new Map(state.nodes.map((n, i) => [n.uid, i]));
  const reserved = extra?.frame.array ?? 0;
  const dummy = slot.has(DUMMY);

  const nodes: ChainNode[] = state.nodes.map((n) =>
    n.uid === DUMMY
      ? { id: nid(DUMMY), text: 'dummy', sentinel: true }
      : {
          id: nid(n.uid),
          text: String(n.value),
          flipped: n.next !== null && slot.get(n.next)! < slot.get(n.uid)!,
        },
  );
  const pointers: NamedPointer[] = dummy
    ? []
    : [{ name: 'head', to: nid(state.head), side: 'above' }];
  const ptrs = extra?.ptrs ?? {};
  for (const [names, side] of [
    [ABOVE, 'above'],
    [BELOW, 'below'],
  ] as const)
    for (const name of names) {
      if (!(name in ptrs)) continue;
      const u = ptrs[name] ?? null;
      pointers.push({ name, to: u === null ? null : nid(u), side, nullAt: 'after' });
    }
  // The same columns with and without the dummy, so nodes do not jump between rows.
  // (The naive approach never has a dummy, so it reserves no slot for one.)
  const real = state.nodes.length - (dummy ? 1 : 0);
  const room = real + (reserved ? 0 : 1);
  const cols = chainCols(stage, room, reserved ? ARRAY_ROOM : 0);
  const links: ChainLink[] = state.nodes.map((n) => ({
    from: nid(n.uid),
    field: 'next',
    to: n.next === null ? null : nid(n.next),
  }));
  const chain = drawChain(
    {
      kind: 'single',
      nodes,
      links,
      pointers,
      cols,
      minRows: Math.ceil(room / cols),
    },
    roles,
  );
  const shapes: Shape[] = rerouteSkips(chain.shapes, chain.boxes, links, roles);
  if (extra?.heading) shapes.push(heading(extra.heading, roles.get('ask')));
  let { w, h } = chain.bounds;
  if (reserved) {
    const top = chain.bounds.y + chain.bounds.h + 10;
    const centre = (u: number) => {
      const b = chain.boxes.get(nid(u));
      return b && { x: b.x + 21, y: b.y + b.h / 2 };
    };
    shapes.push(
      ...drawArray({
        x0: ARRAY_X,
        y: top,
        size: reserved,
        cells: extra?.array?.cells ?? [],
        roles,
        name: 'vals',
        markers: extra?.array?.markers,
        from: centre,
      }),
    );
    w = Math.max(w, ARRAY_X + reserved * ARRAY.pitch + 20);
    h += ARRAY_ROOM;
  }
  return { shapes, bounds: { x: 0, y: chain.bounds.y, w, h }, label: label(step) };
}

function label(step: Step<RKState, RKExtra>): string {
  const { state, extra } = step;
  const byUid = new Map(state.nodes.map((n) => [n.uid, n.value]));
  const name = (u: number | null) =>
    u === null ? 'null' : u === DUMMY ? 'dummy' : String(byUid.get(u));
  const parts: string[] = [];
  if (extra?.heading) parts.push(`${extra.heading}.`);
  parts.push(
    state.nodes.some((n) => n.uid === DUMMY)
      ? `Memory holds the dummy and ${state.nodes.length - 1} nodes.`
      : `The list: head → ${arrows(values(state))}.`,
  );
  const locals = Object.entries(extra?.ptrs ?? {});
  if (locals.length)
    parts.push(`Pointers: ${locals.map(([k, u]) => `${k} → ${name(u)}`).join(', ')}.`);
  const cells = extra?.array?.cells.filter((c) => c !== null) ?? [];
  if (extra?.array)
    parts.push(
      `vals holds ${cells.length ? cells.map((c) => c!.value).join(', ') : 'nothing yet'}.`,
    );
  return parts.join(' ');
}
