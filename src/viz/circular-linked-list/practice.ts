import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { call, calls, choice, distinct, lineText, ordinal, pick } from '../_lists/practice-util';
import { defaults, node, values, type CExtra, type CSettings, type CState } from './model';

type Def = VizDef<CState, CSettings, CExtra>;

function someOps(rng: Rng, size: number, fresh: number[], count: number): OpCall[] {
  const out: OpCall[] = [];
  let n = size;
  for (let k = 0; k < count; k++) {
    const x = fresh[k]!;
    const options: OpCall[] = [
      ['insertFront', x],
      ['insertBack', x],
    ];
    if (n > 0) options.push(['removeFront'], ['rotate']);
    const op = pick(rng, options);
    out.push(op);
    n += op[0].startsWith('insert') ? 1 : op[0] === 'removeFront' ? -1 : 0;
  }
  return out;
}

/** The pointer changes of each insert, by pseudocode line, for a list that is not empty. */
const UPDATES: Record<string, string[]> = {
  insertFront: ['insertFront.link', 'insertFront.close'],
  insertBack: ['insertBack.link', 'insertBack.close', 'insertBack.tail'],
};

/**
 * Practice for the circular linked list. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function circularPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const ringText = (s: CState) => values(s).map(String).join(' ') || 'empty';

  return [
    {
      id: 'ring-after',
      title: 'What is the list afterwards?',
      make(rng) {
        const vals = distinct(rng, 7);
        const n = rng.int(2, 4);
        const setup: OpCall[] = vals.slice(0, n).map((v) => ['insertBack', v]);
        const ask = someOps(rng, n, vals.slice(4), 3);
        const t = run([...setup, ...ask]);
        const trace = t.entries
          .slice(setup.length)
          .map((e) => `${call(e.call)} leaves ${ringText(e.end)}`)
          .join('; ');
        return {
          prompt: `Starting from the list shown, run ${calls(ask)}. Type the list from the front (\`tail.next\`) around to \`tail\`. Leave it blank if it ends up empty.`,
          setup,
          answer: { kind: 'sequence', value: values(t.endState()).map(String) },
          explain: `Step by step: ${trace}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'tail-after',
      title: 'Where does tail point?',
      make(rng) {
        const vals = distinct(rng, 7);
        const n = rng.int(2, 4);
        const setup: OpCall[] = vals.slice(0, n).map((v) => ['insertBack', v]);
        const ask = someOps(rng, n, vals.slice(4), rng.int(2, 3));
        const end = run([...setup, ...ask]).endState();
        const right = end.tail === null ? 'null' : String(node(end, end.tail).value);
        return {
          prompt: `Starting from the list shown, run ${calls(ask)}. What does \`tail\` point at afterwards?`,
          setup,
          answer: choice(rng, right, [...vals.map(String), 'null']),
          explain:
            end.tail === null
              ? 'Every node is removed, so `tail` is null.'
              : `The list ends up as ${ringText(end)}, front to back, so \`tail\` points at the last node, ${right}.${ask.some((c) => c[0] === 'rotate') ? ' Each `rotate()` moves tail one step forward.' : ''}`,
          watch: ask,
        };
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons does search make?',
      make(rng) {
        const n = rng.int(3, 6);
        const vals = distinct(rng, n + 1);
        const setup: OpCall[] = vals.slice(0, n).map((v) => ['insertBack', v]);
        const x = rng.int(0, 3) ? vals[rng.int(0, n - 1)]! : vals[n]!;
        const last = run([...setup, ['search', x]])
          .entries.at(-1)!
          .steps.at(-1)!;
        const count = Number(last.vars?.comparisons);
        const found = Number(last.vars?.returned) >= 0;
        return {
          prompt: `How many values does ${call(['search', x])} compare with ${x} on the list shown?`,
          setup,
          answer: { kind: 'number', value: count },
          explain: found
            ? `It starts at the front and stops at ${x}: ${count} ${count === 1 ? 'comparison' : 'comparisons'}.`
            : `${x} is not there, so it goes all the way around: ${count} comparisons, one per node, and stops when it is back at the front.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'update-order',
      title: 'Which pointer changes when?',
      make(rng) {
        const vals = distinct(rng, 5);
        const n = rng.int(1, 4);
        const setup: OpCall[] = vals.slice(0, n).map((v) => ['insertBack', v]);
        const op: OpCall = [rng.int(0, 1) ? 'insertBack' : 'insertFront', vals[4]!];
        const steps = run([...setup, op]).entries.at(-1)!.steps;
        const at = (id: string) => steps.findIndex((s) => s.lines.includes(id));
        const blocks = def().pseudocode(defaults);
        const order = [...UPDATES[op[0]]!]
          .sort((a, b) => at(a) - at(b))
          .map((id) => lineText(blocks, id));
        const k = rng.int(0, order.length - 1);
        return {
          prompt: `${call(op)} changes ${order.length} pointers on the list shown. Which one comes ${k === order.length - 1 ? 'last' : ordinal(k)}?`,
          setup,
          answer: choice(rng, order[k]!, order),
          explain: `The order is ${order.map((t) => `\`${t}\``).join(', then ')}. The new node is linked to the front before \`tail.next\` lets go of it${op[0] === 'insertBack' ? ', and moving tail last is what turns the front into the back' : ''}.`,
          watch: [op],
        };
      },
    },
  ];
}
