import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { ordered } from '../_recursion/kit';
import { defaults, valueText, type MemSettings, type MemState } from './model';

type Def = VizDef<MemState, MemSettings, undefined>;

const run = (stmt: string): OpCall => ['run', stmt];
const code = (cs: OpCall[]) => cs.map((c) => `\`${c[1]}\``).join(', ');

function values(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 9));
  return [...out];
}

/**
 * Practice questions for the memory model. Every answer comes from running the model, so it
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function memoryPractice(def: () => Def): PracticeKind[] {
  const end = (cs: OpCall[], settings: MemSettings = defaults) =>
    new Timeline(def(), settings, 1, cs).endState();
  /** The items of a main-frame variable, as a sequence answer. */
  const items = (s: MemState, name: string) => {
    const v = s.frames[0]!.vars.find((x) => x.name === name)!;
    return valueText(s, v.cell).replace(/[[\]]/g, '').split(', ').filter(Boolean);
  };

  return [
    {
      id: 'alias-list',
      title: 'What does xs hold now?',
      make(rng) {
        const [a, b, c, d] = values(rng, 4) as [number, number, number, number];
        const setup = [run(`xs = [${a}, ${b}]`), run('ys = xs')];
        const moves: OpCall[][] = [
          [run(`ys.append(${c})`)],
          [run(`ys = [${c}]`), run(`ys.append(${d})`)],
          [run(`ys[0] = ${c}`), run(`ys = [${d}]`)],
          [run(`ys.append(${c})`), run(`xs = [${d}]`)],
        ];
        const ask = moves[rng.int(0, moves.length - 1)]!;
        const value = items(end([...setup, ...ask]), 'xs');
        return {
          prompt: `After the statements shown, run ${code(ask)} in Python or Java. What does \`xs\` hold? Type its items in order.`,
          setup,
          answer: { kind: 'sequence', value },
          explain: `ys = xs made two names for one list. Changing that list through ys shows in xs; pointing ys at a new list does not. xs ends as [${value.join(', ')}].`,
          watch: ask,
        };
      },
    },
    {
      id: 'heap-count',
      title: 'How many lists are left?',
      make(rng) {
        const [a, b, c] = values(rng, 3) as [number, number, number];
        const pool: OpCall[] = [
          run(`xs = [${a}]`),
          run('ys = xs'),
          run(`ys = [${b}]`),
          run(`zs = [${c}]`),
          run('xs = zs'),
          run('ys = zs'),
        ];
        const ask = pool.slice(0, rng.int(3, 6));
        const s = end(ask);
        const live = s.heap.filter((o) => !o.garbage).length;
        return {
          prompt: `Run ${code(ask)}. How many lists can a variable still reach? (Lists nothing refers to are garbage and do not count.)`,
          setup: [],
          answer: { kind: 'number', value: live },
          explain: `Follow the arrows from the variables: they reach ${live} list${live === 1 ? '' : 's'}. A list that lost its last reference is garbage.`,
          watch: ask,
        };
      },
    },
    {
      id: 'call-effect',
      title: 'Does the caller see it?',
      make(rng) {
        const cpp = rng.int(0, 1) === 1;
        const settings: MemSettings = { ...defaults, lang: cpp ? 'values' : 'refs' };
        const fns = cpp
          ? ['grow', 'reset', 'growRef', 'resetRef', 'bump', 'bumpRef']
          : ['grow', 'reset', 'bump'];
        const fn = fns[rng.int(0, fns.length - 1)]!;
        const num = fn.startsWith('bump');
        const [a, b] = values(rng, 2) as [number, number];
        const setup = [run(num ? `n = ${a}` : `xs = [${a}, ${b}]`)];
        const arg = num ? 'n' : 'xs';
        const watch = [run(`${fn}(${arg})`)];
        const before = valueText(
          end(setup, settings),
          end(setup, settings).frames[0]!.vars[0]!.cell,
        );
        const after = end([...setup, ...watch], settings);
        const changed = valueText(after, after.frames[0]!.vars[0]!.cell) !== before;
        const options = ['Yes, it changes', 'No, it stays the same'];
        return {
          prompt: `${cpp ? 'In C++' : 'In Python or Java'}, does \`${fn}(${arg})\` change the caller's \`${arg}\`?`,
          setup,
          settings,
          answer: ordered(options, options[changed ? 0 : 1]!),
          explain: changed
            ? `${fn} reaches the caller's ${num ? 'number' : 'list'} itself, so ${arg} becomes ${valueText(after, after.frames[0]!.vars[0]!.cell)}.`
            : `${fn} works on its own copy (of the ${num ? 'number' : cpp ? 'list' : 'reference'}), so ${arg} stays ${before}.`,
          watch,
        };
      },
    },
    {
      id: 'cpp-copy',
      title: 'C++ copies',
      make(rng) {
        const settings: MemSettings = { ...defaults, lang: 'values' };
        const [a, b, c] = values(rng, 3) as [number, number, number];
        const byRef = rng.int(0, 1) === 1;
        const setup = [run(`xs = [${a}, ${b}]`), run(byRef ? '&ys = xs' : 'ys = xs')];
        const ask = [run(rng.int(0, 1) ? `ys.append(${c})` : `ys[0] = ${c}`)];
        const value = items(end([...setup, ...ask], settings), 'xs');
        return {
          prompt: `In C++, after the statements shown, run ${code(ask)}. What does \`xs\` hold?`,
          setup,
          settings,
          answer: { kind: 'sequence', value },
          explain: byRef
            ? `&ys = xs made ys another name for xs, so the change lands in xs: [${value.join(', ')}].`
            : `ys = xs copied the values, so changing ys leaves xs as [${value.join(', ')}].`,
          watch: ask,
        };
      },
    },
  ];
}
