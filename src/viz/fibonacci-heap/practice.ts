import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { defaults, show, type FibExtra, type FibSettings, type FibState } from './model';

type Def = VizDef<FibState, FibSettings, FibExtra>;
type FibStep = Step<FibState, FibExtra>;

function distinct(rng: Rng, n: number, avoid: number[] = []): number[] {
  const out = new Set<number>();
  while (out.size < n) {
    const k = rng.int(10, 99);
    if (!avoid.includes(k)) out.add(k);
  }
  return [...out];
}

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

/**
 * Practice questions for Fibonacci heaps. Every answer comes from running the model, so it
 * always agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function fibonacciPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const lastOp = (cs: OpCall[]): FibStep[] => {
    const t = run(cs);
    return t.entries[t.entries.length - 1]!.steps;
  };
  /**
   * A heap with some shape: inserts, one extractMin to consolidate them, then decrease-keys of
   * non-root keys, which leave marks behind.
   */
  const shaped = (rng: Rng, cuts: number) => {
    const keys = distinct(rng, rng.int(9, 13));
    const setup: OpCall[] = [...inserts(keys), ['deletemin']];
    for (let i = 0; i < cuts; i++) {
      const s = run(setup).endState();
      const inner = Object.values(s.nodes).filter((n) => n.parent !== null);
      if (inner.length === 0) break;
      const x = inner[rng.int(0, inner.length - 1)]!;
      // A new key that no node holds, so every key in the picture names one node.
      const used = new Set(Object.values(s.nodes).map((n) => n.key));
      let k = x.key - rng.int(1, 9);
      while (used.has(k)) k -= 1;
      setup.push(['decrease', x.key, k]);
    }
    return setup;
  };
  /** A key held by a non-root node, and a new key below its parent's. */
  const deepDecrease = (rng: Rng, setup: OpCall[]): OpCall | null => {
    const s = run(setup).endState();
    const used = Object.values(s.nodes).map((n) => n.key);
    const inner = Object.values(s.nodes).filter((n) => n.parent !== null);
    if (inner.length === 0) return null;
    const x = inner[rng.int(0, inner.length - 1)]!;
    let k = rng.int(1, 9);
    while (used.includes(k)) k += 1;
    return ['decrease', x.key, k];
  };

  return [
    {
      id: 'trees-after-extract',
      title: 'How many trees after the first extractMin?',
      make(rng) {
        const keys = distinct(rng, rng.int(6, 15));
        const setup = inserts(keys);
        const steps = lastOp([...setup, ['deletemin']]);
        const trees = Number(steps[steps.length - 1]!.vars?.['t(H)']);
        const n = keys.length - 1;
        return {
          prompt: `The picture shows ${keys.length} keys after ${keys.length} inserts: ${keys.length} one-node trees. Run \`extractMin()\`. How many trees are in the root list afterwards?`,
          setup,
          answer: { kind: 'number', value: trees },
          explain: `The minimum goes, and consolidate links the other ${n} one-node trees two at a time, like a binary counter: ${n} = ${n.toString(2)} in binary, one tree per 1 bit. That is ${trees}.`,
          watch: [['deletemin']],
        };
      },
    },
    {
      id: 'decrease-cuts',
      title: 'How many cuts does a decrease-key make?',
      make(rng) {
        for (;;) {
          const setup = shaped(rng, rng.int(1, 3));
          const call = deepDecrease(rng, setup);
          if (!call) continue;
          const steps = lastOp([...setup, call]);
          const cuts = Number(steps[steps.length - 1]!.vars?.cuts);
          const [, k, k2] = call;
          return {
            prompt: `Run \`decreaseKey(${k}, ${k2})\` on the heap shown. Marked nodes have a dashed ring. How many cuts does it make, cascading cuts included?`,
            setup,
            answer: { kind: 'number', value: cuts },
            explain:
              cuts === 0
                ? `${k2} is still no smaller than its parent, so nothing is cut.`
                : `${k2} is smaller than its parent, so it is cut: that is 1. Then each marked ancestor in a row is cut too, and the first unmarked one gets a mark (unless it is a root). ${cuts} ${cuts === 1 ? 'cut' : 'cuts'} in all.`,
            watch: [call],
          };
        }
      },
    },
    {
      id: 'potential-after',
      title: 'What is the potential afterwards?',
      make(rng) {
        for (;;) {
          const setup = shaped(rng, rng.int(0, 2));
          const call = deepDecrease(rng, setup);
          if (!call) continue;
          const steps = lastOp([...setup, call]);
          const v = steps[steps.length - 1]!.vars ?? {};
          const [, k, k2] = call;
          return {
            prompt: `Run \`decreaseKey(${k}, ${k2})\` on the heap shown. What is the potential Φ = t(H) + 2·m(H) afterwards? t(H) counts the trees and m(H) the marked nodes.`,
            setup,
            answer: { kind: 'number', value: Number(v['Φ']) },
            explain: `Afterwards there ${v['t(H)'] === 1 ? 'is 1 tree' : `are ${v['t(H)']} trees`} and ${v['m(H)']} marked ${v['m(H)'] === 1 ? 'node' : 'nodes'}, so Φ = ${v['t(H)']} + 2·${v['m(H)']} = ${v['Φ']}.`,
            watch: [call],
          };
        }
      },
    },
    {
      id: 'marked-after',
      title: 'Which nodes are marked afterwards?',
      make(rng) {
        for (;;) {
          const setup = shaped(rng, rng.int(0, 2));
          const call = deepDecrease(rng, setup);
          if (!call) continue;
          const steps = lastOp([...setup, call]);
          const end = steps[steps.length - 1]!.state;
          const keys = Object.values(end.nodes)
            .filter((n) => n.mark)
            .map((n) => n.key)
            .sort((a, b) => a - b)
            .map(show);
          const [, k, k2] = call;
          return {
            prompt: `Run \`decreaseKey(${k}, ${k2})\` on the heap shown. Which keys are in marked nodes afterwards? Type them smallest first, separated by spaces, or leave it blank if none are.`,
            setup,
            answer: { kind: 'sequence', value: keys },
            explain: keys.length
              ? `A node is marked when it has lost one child since it last became a child itself. Afterwards that is ${keys.join(', ')}.`
              : 'A node is marked when it has lost one child since it last became a child itself. Afterwards no node is marked.',
            watch: [call],
          };
        }
      },
    },
  ];
}
