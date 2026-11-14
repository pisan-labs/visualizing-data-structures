/**
 * The drawing: what is asked at the top left, the list as a chain of [value | next] nodes
 * (src/layouts/linked.ts) with head above and the running operation's pointers below, and, for
 * the naive palindrome check, the array A the values are copied into, under the list.
 *
 * Nodes keep their slots for the whole operation, so a half turned around shows as arrows
 * pointing back (the nodes are flipped to keep the arrows short), and a copied value slides
 * out of its node into A.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import {
  drawChain,
  type ChainLink,
  type ChainNode,
  type NamedPointer,
} from '../../layouts/linked';
import type { Scene, Shape } from '../../render/scene';
import {
  ARRAY,
  arrows,
  chainCols,
  drawArray,
  heading,
  nid,
  rerouteSkips,
} from '../_lists2/kit';
import { values, type FSExtra, type FSSettings, type FSState } from './model';

/** Local pointers are drawn below the nodes, in this order when they share a node. */
const LOCALS = ['slow', 'fast', 'cur', 'prev', 'left', 'right'];
const ARRAY_X = 70;
const ARRAY_ROOM = ARRAY.h + ARRAY.below + 24;

export function view(
  step: Step<FSState, FSExtra>,
  _settings: FSSettings,
  stage?: StageSize,
): Scene {
  const { state, extra } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const slot = new Map(state.nodes.map((n, i) => [n.uid, i]));
  const reserved = extra?.frame.array ?? 0;

  const nodes: ChainNode[] = state.nodes.map((n) => ({
    id: nid(n.uid),
    text: String(n.value),
    flipped: n.next !== null && slot.get(n.next)! < slot.get(n.uid)!,
  }));
  const pointers: NamedPointer[] = [{ name: 'head', to: nid(state.head), side: 'above' }];
  const ptrs = extra?.ptrs ?? {};
  for (const name of LOCALS) {
    if (!(name in ptrs)) continue;
    const u = ptrs[name] ?? null;
    pointers.push({ name, to: u === null ? null : nid(u), side: 'below', nullAt: 'after' });
  }
  const cols = chainCols(stage, state.nodes.length, reserved ? ARRAY_ROOM : 0);
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
      minRows: 1,
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
        name: 'A',
        markers: extra?.array?.markers,
        from: centre,
      }),
    );
    w = Math.max(w, ARRAY_X + reserved * ARRAY.pitch + 20);
    h += ARRAY_ROOM;
  }
  return { shapes, bounds: { x: 0, y: chain.bounds.y, w, h }, label: label(step) };
}

function label(step: Step<FSState, FSExtra>): string {
  const { state, extra } = step;
  const parts = [`The list: head → ${arrows(values(state))}.`];
  const byUid = new Map(state.nodes.map((n) => [n.uid, n.value]));
  const locals = Object.entries(extra?.ptrs ?? {});
  if (locals.length)
    parts.push(
      `Pointers: ${locals.map(([k, u]) => `${k} → ${u === null ? 'null' : byUid.get(u)}`).join(', ')}.`,
    );
  const cells = extra?.array?.cells.filter((c) => c !== null) ?? [];
  if (extra?.array) parts.push(`A holds ${cells.length ? cells.map((c) => c!.value).join(', ') : 'nothing yet'}.`);
  if (extra?.heading) parts.unshift(`${extra.heading}.`);
  return parts.join(' ');
}
