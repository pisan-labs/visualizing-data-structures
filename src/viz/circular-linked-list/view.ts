import type { MarkRole, Step } from '../../engine/types';
import { drawChain, reachable, type ChainNode, type NamedPointer } from '../../layouts/linked';
import type { Scene } from '../../render/scene';
import { fmt } from '../linked-list/model';
import { describe, nid, node, type CExtra, type CSettings, type CState } from './model';

const LOCALS = ['first', 'cur', 'new'];

export function view(step: Step<CState, CExtra>, _settings: CSettings): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const ptrs = extra.ptrs ?? {};
  const live = reachable<number>([state.tail, ...Object.values(ptrs)], (u) => [
    node(state, u).next,
  ]);
  const ref = (u: number | null) => (u === null ? null : nid(u));

  // Never turned around: the link from the last node back to the first is the circle itself,
  // drawn as a loop under the list.
  const nodes: ChainNode[] = state.nodes.map((n) => ({
    id: nid(n.uid),
    text: String(n.value),
    status: !live.has(n.uid) ? 'garbage' : n.uid === extra.pending ? 'pending' : 'live',
  }));
  const pointers: NamedPointer[] = [
    { name: 'tail', to: ref(state.tail), side: 'above', nullAt: 'before' },
  ];
  for (const name of LOCALS) {
    if (name in ptrs) pointers.push({ name, to: ref(ptrs[name] ?? null), side: 'below' });
  }
  const { shapes, bounds } = drawChain(
    {
      kind: 'single',
      nodes,
      links: state.nodes.map((n) => ({ from: nid(n.uid), field: 'next', to: ref(n.next) })),
      pointers,
    },
    roles,
  );

  const parts = [describe(state)];
  const locals = Object.entries(ptrs);
  const at = (u: number | null) => (u === null ? 'null' : fmt(node(state, u).value));
  if (locals.length)
    parts.push(`Pointers: ${locals.map(([k, u]) => `${k} → ${at(u)}`).join(', ')}.`);
  if (extra.pending !== undefined)
    parts.push(`New node ${at(extra.pending)} is not linked in yet.`);
  return { shapes, bounds, label: parts.join(' ') };
}
