import type { MarkRole, Step } from '../../engine/types';
import {
  drawChain,
  reachable,
  type ChainLink,
  type ChainNode,
  type NamedPointer,
} from '../../layouts/linked';
import type { Scene } from '../../render/scene';
import { fmt } from '../linked-list/model';
import { describe, nid, node, type DExtra, type DSettings, type DState } from './model';

/** Local pointers are drawn below the nodes, in this order when they share a node. */
const LOCALS = ['succ', 'cur', 'tmp', 'new'];

export function view(step: Step<DState, DExtra>, settings: DSettings): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const ptrs = extra.ptrs ?? {};
  const slot = new Map(state.nodes.map((n, i) => [n.uid, i]));

  const live = reachable<number>(
    [state.nil, state.head, state.tail, ...Object.values(ptrs)],
    (u) => [node(state, u).next, node(state, u).prev],
  );

  const nodes: ChainNode[] = state.nodes.map((n) => {
    const here = slot.get(n.uid)!;
    const dir = (u: number | null) => (u === null ? 0 : Math.sign(slot.get(u)! - here));
    const end = (u: number | null) => u === null || u === state.nil;
    // A node that has been turned around by a reversal (prev points forward, or next points
    // back while prev is at an end) is drawn turned around, so its arrows stay straight.
    const flipped =
      !n.sentinel && (dir(n.prev) > 0 || (end(n.prev) && !end(n.next) && dir(n.next) < 0));
    return {
      id: nid(n.uid),
      text: n.sentinel ? 'nil' : String(n.value),
      sentinel: n.sentinel,
      flipped,
      status: !live.has(n.uid) ? 'garbage' : n.uid === extra.pending ? 'pending' : 'live',
    };
  });

  const ref = (u: number | null) => (u === null ? null : nid(u));
  const links: ChainLink[] = state.nodes.flatMap((n) => [
    { from: nid(n.uid), field: 'next' as const, to: ref(n.next) },
    { from: nid(n.uid), field: 'prev' as const, to: ref(n.prev) },
  ]);

  const pointers: NamedPointer[] = [];
  if (settings.sentinel !== 'on') {
    pointers.push({ name: 'head', to: ref(state.head), side: 'above', nullAt: 'before' });
    pointers.push({ name: 'tail', to: ref(state.tail), side: 'above', nullAt: 'before' });
  }
  for (const name of LOCALS) {
    if (!(name in ptrs)) continue;
    pointers.push({
      name,
      to: ref(ptrs[name] ?? null),
      side: 'below',
      nullAt: extra.nullAt?.[name],
    });
  }

  const { shapes, bounds } = drawChain({ kind: 'double', nodes, links, pointers }, roles);
  return { shapes, bounds, label: label(step, settings) };
}

function label(step: Step<DState, DExtra>, settings: DSettings): string {
  const { state, extra = {} } = step;
  const parts = [describe(state, settings)];
  const at = (u: number | null) =>
    u === null ? 'null' : node(state, u).sentinel ? 'nil' : fmt(node(state, u).value);
  const locals = Object.entries(extra.ptrs ?? {});
  if (locals.length)
    parts.push(`Pointers: ${locals.map(([k, u]) => `${k} → ${at(u)}`).join(', ')}.`);
  if (extra.pending !== undefined)
    parts.push(`New node ${at(extra.pending)} is not linked in yet.`);
  return parts.join(' ');
}
