import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { call, calls, choice, distinct, lineText, ordinal, pick } from '../_lists/practice-util';
import { defaults, node, values, type DExtra, type DSettings, type DState } from './model';

type Def = VizDef<DState, DSettings, DExtra>;

function someOps(rng: Rng, size: number, fresh: number[], count: number): OpCall[] {
  const out: OpCall[] = [];
  let n = size;
  for (let k = 0; k < count; k++) {
    const x = fresh[k]!;
    const options: OpCall[] = [
      ['insertHead', x],
      ['insertTail', x],
      ['insertAt', rng.int(0, n), x],
    ];
    if (n > 0) options.push(['removeHead'], ['removeTail'], ['removeAt', rng.int(0, n - 1)]);
    if (n > 1) options.push(['reverse']);
    const op = pick(rng, options);
    out.push(op);
    n += op[0].startsWith('insert') ? 1 : op[0].startsWith('remove') ? -1 : 0;
  }
  return out;
}

/** The four pointer updates of each insert, by pseudocode line (sentinel version). */
const UPDATES: Record<string, string[]> = {
  insertHead: [
    'insertHead.setNext',
    'insertHead.setPrev',
    'insertHead.fixSucc',
    'insertHead.fixPred',
  ],
  insertTail: [
    'insertTail.setNext',
    'insertTail.setPrev',
    'insertTail.fixPred',
    'insertTail.fixSucc',
  ],
  insertAt: ['insertAt.setNext', 'insertAt.setPrev', 'insertAt.predLink', 'insertAt.succPrev'],
};

/** "follows next 3 times", "follows prev once", or no hops at all at index 0 or n - 1. */
const follows = (ptr: string, hops: number) =>
  hops === 0
    ? 'is already there, so it follows no pointers'
    : `follows ${ptr} ${hops === 1 ? 'once' : `${hops} times`}`;

/**
 * Practice for the doubly linked list (with the sentinel, the default). Every answer comes from
 * running the model. `def` is a getter to avoid an import cycle.
 */
export function doublyPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const listText = (s: DState) => values(s).map(String).join(' ') || 'empty';

  return [
    {
      id: 'list-after',
      title: 'What is the list afterwards?',
      make(rng) {
        const vals = distinct(rng, 7);
        const n = rng.int(2, 4);
        const setup: OpCall[] = vals.slice(0, n).map((v) => ['insertTail', v]);
        const ask = someOps(rng, n, vals.slice(4), 3);
        const t = run([...setup, ...ask]);
        const trace = t.entries
          .slice(setup.length)
          .map((e) => `${call(e.call)} leaves ${listText(e.end)}`)
          .join('; ');
        return {
          prompt: `Starting from the list shown, run ${calls(ask)}. Type the list from front to back. Leave it blank if it ends up empty.`,
          setup,
          answer: { kind: 'sequence', value: values(t.endState()).map(String) },
          explain: `Step by step: ${trace}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'update-order',
      title: 'In what order do the pointers change?',
      make(rng) {
        const vals = distinct(rng, 5);
        const n = rng.int(1, 4);
        const setup: OpCall[] = vals.slice(0, n).map((v) => ['insertTail', v]);
        const x = vals[4]!;
        const op: OpCall = pick(rng, [
          ['insertHead', x],
          ['insertTail', x],
          ['insertAt', rng.int(1, n), x],
        ] as OpCall[]);
        const steps = run([...setup, op]).entries.at(-1)!.steps;
        const at = (id: string) => steps.findIndex((s) => s.lines.includes(id));
        const blocks = def().pseudocode(defaults);
        const order = [...UPDATES[op[0]]!]
          .sort((a, b) => at(a) - at(b))
          .map((id) => lineText(blocks, id));
        const k = rng.int(2, 3);
        return {
          prompt: `${call(op)} links a new node into the list shown with four pointer changes. Which one comes ${ordinal(k)}?`,
          setup,
          answer: choice(rng, order[k]!, order),
          explain: `The order is ${order.map((t) => `\`${t}\``).join(', then ')}. The new node's own two pointers go first, since they do not change the list. Of the last two, the one that reaches a neighbour through the other has to run before that other changes.`,
          watch: [op],
        };
      },
    },
    {
      id: 'nearer-end',
      title: 'How many hops for get(i)?',
      make(rng) {
        const n = rng.int(4, 8);
        const setup: OpCall[] = distinct(rng, n).map((v) => ['insertTail', v]);
        const i = rng.int(0, n - 1);
        const steps = run([...setup, ['get', i]]).entries.at(-1)!.steps;
        const hops = Math.max(0, ...steps.map((s) => Number(s.vars?.hops ?? 0)));
        const front = steps.some((s) => s.lines.includes('get.front'));
        return {
          prompt: `\`get(i)\` starts from whichever end is nearer. How many pointers does ${call(['get', i])} follow on the list shown?`,
          setup,
          answer: { kind: 'number', value: hops },
          explain: front
            ? `Index ${i} is in the front half of ${n} nodes, so it starts at the first node and ${follows('next', hops)}.`
            : `Index ${i} is in the back half of ${n} nodes, so it starts at the last node and ${follows('prev', hops)}.`,
          watch: [['get', i]],
        };
      },
    },
    {
      id: 'sentinel-ends',
      title: 'Where do nil.next and nil.prev point?',
      make(rng) {
        const vals = distinct(rng, 7);
        const n = rng.int(1, 3);
        const setup: OpCall[] = vals.slice(0, n).map((v) => ['insertTail', v]);
        const ask = someOps(rng, n, vals.slice(4), rng.int(2, 3));
        const end = run([...setup, ...ask]).endState();
        const which = rng.int(0, 1) ? 'next' : 'prev';
        const target = node(end, end.nil!)[which]!;
        const self = 'nil itself';
        const right = target === end.nil ? self : String(node(end, target).value);
        return {
          prompt: `Starting from the list shown, run ${calls(ask)}. What does \`nil.${which}\` point at afterwards?`,
          setup,
          answer: choice(rng, right, [...vals.map(String), self]),
          explain:
            target === end.nil
              ? 'The list ends up empty, so the sentinel points at itself both ways.'
              : `The list ends up as ${listText(end)}. \`nil.${which}\` is the ${which === 'next' ? 'first' : 'last'} node, ${right}.`,
          watch: ask,
        };
      },
    },
  ];
}
