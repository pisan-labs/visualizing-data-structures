import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, node, values, type ListExtra, type ListSettings, type ListState } from './model';
import { call, calls, choice, distinct, lineText, pick } from './practice-util';

type Def = VizDef<ListState, ListSettings, ListExtra>;

/** A few operations that make sense on a list of `size` nodes, using fresh values. */
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

/**
 * Practice for the singly linked list. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function listPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: ListSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const listText = (s: ListState) => values(s).map(String).join(' ') || 'empty';

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
          prompt: `Starting from the list shown, run ${calls(ask)}. Type the list from head to tail. Leave it blank if it ends up empty.`,
          setup,
          answer: { kind: 'sequence', value: values(t.endState()).map(String) },
          explain: `Step by step: ${trace}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'link-first',
      title: 'Which pointer changes first?',
      make(rng) {
        const vals = distinct(rng, 5);
        const n = rng.int(2, 4);
        const setup: OpCall[] = vals.slice(0, n).map((v) => ['insertTail', v]);
        const x = vals[4]!;
        // Always a node after the new one, so the wrong order really would lose something.
        const i = rng.int(0, n - 1);
        const op: OpCall = i === 0 && rng.int(0, 1) ? ['insertHead', x] : ['insertAt', i, x];
        const ids =
          op[0] === 'insertHead'
            ? ['insertHead.link', 'insertHead.head']
            : i === 0
              ? ['insertAt.link0', 'insertAt.head']
              : ['insertAt.link1', 'insertAt.link2'];
        const steps = run([...setup, op]).entries.at(-1)!.steps;
        const at = (id: string) => steps.findIndex((s) => s.lines.includes(id));
        const [first, second] = [...ids].sort((a, b) => at(a) - at(b));
        const texts = def().pseudocode(defaults);
        return {
          prompt: `${call(op)} links a new node into the list shown with two pointer changes. Which one has to happen first?`,
          setup,
          answer: choice(rng, lineText(texts, first!), [lineText(texts, second!)]),
          explain: `\`${lineText(texts, first!)}\` comes first. ${steps[at(second!)]!.say}`,
          watch: [op],
        };
      },
    },
    {
      id: 'points-at',
      title: 'Where does head or tail point?',
      make(rng) {
        const vals = distinct(rng, 7);
        const n = rng.int(2, 4);
        const setup: OpCall[] = vals.slice(0, n).map((v) => ['insertTail', v]);
        const ask = someOps(rng, n, vals.slice(4), rng.int(2, 3));
        const end = run([...setup, ...ask]).endState();
        const which = rng.int(0, 1) ? 'head' : 'tail';
        const uid = end[which];
        const right = uid === null ? 'null' : String(node(end, uid).value);
        const others = [...vals.map(String), 'null'];
        return {
          prompt: `Starting from the list shown, run ${calls(ask)}. What does \`${which}\` point at afterwards?`,
          setup,
          answer: choice(rng, right, others),
          explain:
            uid === null
              ? `The list ends up empty, so \`${which}\` is null.`
              : `The list ends up as ${listText(end)}, so \`${which}\` points at the ${which === 'head' ? 'first' : 'last'} node, ${right}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'hops',
      title: 'How many hops?',
      make(rng) {
        const n = rng.int(3, 6);
        const vals = distinct(rng, n + 1);
        const setup: OpCall[] = vals.slice(0, n).map((v) => ['insertTail', v]);
        const kind = rng.int(0, 2);
        const settings: ListSettings = { ...defaults, tail: kind === 0 ? 'off' : 'on' };
        const i = rng.int(0, n - 1);
        const op: OpCall =
          kind === 0 ? ['insertTail', vals[n]!] : kind === 1 ? ['get', i] : ['removeTail'];
        const steps = run([...setup, op], settings).entries.at(-1)!.steps;
        const hops = Math.max(0, ...steps.map((s) => Number(s.vars?.hops ?? 0)));
        const prompt =
          kind === 0
            ? `This list has only a head pointer. How many times does ${call(op)} follow a next pointer to find the last node?`
            : kind === 1
              ? `How many times does ${call(op)} follow a next pointer?`
              : `This list has a tail pointer. How many times does ${call(op)} follow a next pointer?`;
        const explain =
          kind === 0
            ? `Without tail, it walks from head to the last node of ${n}: ${hops} hops.`
            : kind === 1
              ? `It starts at head (index 0) and follows next until index ${i}: ${hops} hops.`
              : `It needs the node before the last one, and tail cannot say which that is, so it walks from head: ${hops} hops.`;
        return {
          prompt,
          setup,
          settings,
          answer: { kind: 'number', value: hops },
          explain,
          watch: [op],
        };
      },
    },
  ];
}
