import type { AnyVizDef, Controls, OpCall } from './types';

/**
 * Compare mode runs the same operations on two pages side by side (BST vs AVL tree, two sorting
 * algorithms on the same input). These helpers decide which operations both pages understand.
 */

/** Operations both pages have, with the same number of values. */
export function sharedOps(a: AnyVizDef, b: AnyVizDef): Set<string> {
  const out = new Set<string>();
  for (const [name, spec] of Object.entries(a.ops)) {
    const other = b.ops[name];
    if (other && other.arity === spec.arity) out.add(name);
  }
  return out;
}

/** What a page is for: the operation on its primary button, else on its first button. */
export function mainOp(def: AnyVizDef): string | undefined {
  const buttons = def.controls.buttons;
  return (buttons.find((b) => b.primary) ?? buttons[0])?.op;
}

/**
 * Two pages can be compared when the second can run the first one's main operation. Sharing
 * only "clear" or "peek" (a stack and a queue) is not enough.
 */
export function canCompare(a: AnyVizDef, b: AnyVizDef): boolean {
  const op = mainOp(a);
  return op !== undefined && sharedOps(a, b).has(op);
}

/** Keep only the calls both pages can run. */
export function keepShared(calls: OpCall[], shared: Set<string>): OpCall[] {
  return calls.filter(([op]) => shared.has(op));
}

/** The first page's controls, limited to operations the second page can run too. */
export function sharedControls(a: AnyVizDef, b: AnyVizDef): Controls {
  const shared = sharedOps(a, b);
  const c = a.controls;
  const random = c.random;
  return {
    ...c,
    buttons: c.buttons.filter((x) => shared.has(x.op)),
    random: random && {
      label: random.label,
      make: (rng) => keepShared(random.make(rng), shared),
    },
    presets: c.presets?.map((p) => ({
      label: p.label,
      make: (rng, size, settings) => keepShared(p.make(rng, size, settings), shared),
    })),
  };
}
