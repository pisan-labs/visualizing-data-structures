import type { MarkRole, Step } from '../../engine/types';
import { drawChain, reachable, type ChainNode, type NamedPointer } from '../../layouts/linked';
import type { Scene } from '../../render/scene';
import {
  describe,
  fmt,
  nid,
  node,
  type ListExtra,
  type ListSettings,
  type ListState,
} from './model';

/** Local pointers are drawn below the nodes, in this order when they share a node. */
const LOCALS = ['prev', 'cur', 'next', 'new'];

export function view(step: Step<ListState, ListExtra>, settings: ListSettings): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const tailOn = settings.tail === 'on';
  const ptrs = extra.ptrs ?? {};
  const slot = new Map(state.nodes.map((n, i) => [n.uid, i]));

  // Garbage: nodes that neither head, tail nor a local pointer can reach.
  const live = reachable<number>(
    [state.head, tailOn ? state.tail : null, ...Object.values(ptrs)],
    (u) => [node(state, u).next],
  );

  const nodes: ChainNode[] = state.nodes.map((n) => {
    const target = n.next === null ? undefined : slot.get(n.next);
    return {
      id: nid(n.uid),
      text: String(n.value),
      status: !live.has(n.uid) ? 'garbage' : n.uid === extra.pending ? 'pending' : 'live',
      // Halfway through a reversal some nodes point back; turn them around to keep arrows short.
      flipped: target !== undefined && target < slot.get(n.uid)!,
    };
  });

  const pointers: NamedPointer[] = [
    { name: 'head', to: ref(state.head), side: 'above', nullAt: 'before' },
  ];
  if (tailOn) pointers.push({ name: 'tail', to: ref(state.tail), side: 'above', nullAt: 'before' });
  for (const name of LOCALS) {
    if (!(name in ptrs)) continue;
    pointers.push({
      name,
      to: ref(ptrs[name] ?? null),
      side: 'below',
      nullAt: extra.nullAt?.[name],
    });
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

  return { shapes, bounds, label: label(step, settings) };
}

const ref = (uid: number | null) => (uid === null ? null : nid(uid));

function label(step: Step<ListState, ListExtra>, settings: ListSettings): string {
  const { state, extra = {} } = step;
  const parts = [describe(state, settings)];
  const locals = Object.entries(extra.ptrs ?? {});
  if (locals.length) {
    const at = (u: number | null) => (u === null ? 'null' : fmt(node(state, u).value));
    parts.push(`Pointers: ${locals.map(([k, u]) => `${k} → ${at(u)}`).join(', ')}.`);
  }
  if (extra.pending !== undefined) {
    parts.push(`New node ${fmt(node(state, extra.pending).value)} is not linked in yet.`);
  }
  return parts.join(' ');
}
