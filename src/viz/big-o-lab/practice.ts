import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { ordered, shuffle } from '../_recursion/kit';
import {
  FNS,
  FN_LABEL,
  count,
  defaults,
  ratioText,
  stepsVar,
  timeText,
  type Fn,
  type LabSettings,
  type LabState,
} from './model';

type Def = VizDef<LabState, LabSettings, undefined>;

/** Calls that show exactly `fns` (the lab starts with log n, n, n log n and n² shown). */
function showOnly(state: LabState, fns: readonly Fn[]): OpCall[] {
  return FNS.filter((f) => state.shown.includes(f) !== fns.includes(f)).map((f) => [`show-${f}`]);
}

/**
 * Practice questions for the growth lab. Every count comes from the model, so answers agree
 * with the bars. `def` is a getter to avoid an import cycle.
 */
export function bigOPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const start = () => run([]).endState();
  const setupFor = (fns: readonly Fn[], n: number): OpCall[] => [
    ...showOnly(start(), fns),
    ['setn', n],
  ];
  const steps = (cs: OpCall[], f: Fn) => run(cs).entries.at(-1)!.steps.at(-1)!.vars?.[stepsVar(f)];
  /** "1 step", "24 steps". */
  const stepText = (cs: OpCall[], f: Fn) => {
    const v = steps(cs, f);
    return `${v} ${v === '1' ? 'step' : 'steps'}`;
  };
  /** The curve that grows faster (later in FNS) has strictly more steps already. */
  const fasterAhead = (f: Fn, g: Fn, cf: number, cg: number) =>
    FNS.indexOf(f) > FNS.indexOf(g) ? cf > cg : cg > cf;

  return [
    {
      id: 'which-bigger',
      title: 'Which takes more steps?',
      make(rng) {
        const [f, g] = shuffle(rng, FNS.slice(1)).slice(0, 2) as [Fn, Fn];
        const n = [2, 3, 4, 5, 8, 16, 100][rng.int(0, 6)]!;
        const cf = count(f, n).lg;
        const cg = count(g, n).lg;
        const options = [FN_LABEL[f], FN_LABEL[g], 'The same'];
        const right = cf === cg ? 'The same' : cf > cg ? FN_LABEL[f] : FN_LABEL[g];
        const setup = setupFor(
          [f, g].sort((a, b) => FNS.indexOf(a) - FNS.indexOf(b)),
          n,
        );
        return {
          prompt: `At n = ${n}, which takes more steps: ${FN_LABEL[f]} or ${FN_LABEL[g]}? (log n here counts halvings, so log 8 = 3.)`,
          setup: setup.slice(0, -1),
          answer: ordered(options, right),
          explain: `At n = ${n}, ${FN_LABEL[f]} takes ${stepText(setup, f)} and ${FN_LABEL[g]} takes ${stepText(setup, g)}.${fasterAhead(f, g, cf, cg) ? '' : ' For small n the faster-growing curve does not always win yet.'}`,
          watch: [setup.at(-1)!],
        };
      },
    },
    {
      id: 'doubling-factor',
      title: 'What does doubling n do?',
      make(rng) {
        const f = (['1', 'n', 'n2', '2n'] as const)[rng.int(0, 3)]!;
        const n = f === '2n' ? rng.int(2, 6) : [4, 10, 50, 1000][rng.int(0, 3)]!;
        const setup = setupFor([f], n);
        const end = run([...setup, ['double']]).endState();
        const value = Number(count(f, end.n).exact! / count(f, n).exact!);
        return {
          prompt: `n doubles from ${n} to ${2 * n}. How many times more steps does ${FN_LABEL[f]} take?`,
          setup,
          answer: { kind: 'number', value },
          explain: `${FN_LABEL[f]} goes from ${steps(setup, f)} to ${stepText([...setup, ['double']], f)}: ${ratioText(f, n, 2 * n)}.${f === '2n' ? ' Doubling n squares 2ⁿ, so the factor is 2ⁿ itself.' : ''}`,
          watch: [['double']],
        };
      },
    },
    {
      id: 'order',
      title: 'Slowest to fastest',
      make(rng) {
        const picked = shuffle(rng, FNS).slice(0, 4);
        const letters = ['A', 'B', 'C', 'D'];
        const names = picked.map((f, i) => `${letters[i]} = ${FN_LABEL[f]}`).join(', ');
        const big = 1_000_000;
        const sorted = picked
          .map((f, i) => ({ f, letter: letters[i]!, lg: count(f, big).lg }))
          .sort((a, b) => a.lg - b.lg);
        const ordered = [...picked].sort((a, b) => FNS.indexOf(a) - FNS.indexOf(b));
        const setup = setupFor(ordered, 16);
        return {
          prompt: `Order these from slowest growing to fastest growing: ${names}. Type the letters.`,
          setup,
          answer: { kind: 'sequence', value: sorted.map((x) => x.letter) },
          explain: `At n = 1,000,000 the counts line up as ${sorted.map((x) => `${FN_LABEL[x.f]}`).join(' < ')}. Constants and logs are cheap, polynomials grow with their power, and 2ⁿ and n! leave everything behind.`,
          watch: [['setn', big]],
        };
      },
    },
    {
      id: 'how-long',
      title: 'How long does it take?',
      make(rng) {
        const cases: [Fn, number][] = [
          ['n', 1_000_000],
          ['nlogn', 1_000_000],
          ['n2', 100_000],
          ['n2', 1_000_000],
          ['2n', 40],
          ['2n', 60],
          ['fact', 15],
          ['fact', 20],
        ];
        const [f, n] = cases[rng.int(0, cases.length - 1)]!;
        const options = [
          'Under a second',
          'Seconds to hours',
          'Days to years',
          'Centuries or more',
        ];
        const sec = 10 ** (count(f, n).lg - 9);
        const right =
          sec < 1
            ? options[0]!
            : sec < 86400
              ? options[1]!
              : sec < 100 * 3.156e7
                ? options[2]!
                : options[3]!;
        const setup = setupFor([f], n);
        return {
          prompt: `A computer does a billion steps a second. Roughly how long do ${FN_LABEL[f]} steps take at n = ${n.toLocaleString('en-US')}?`,
          setup: setup.slice(0, -1),
          answer: ordered(options, right),
          explain: `${FN_LABEL[f]} at n = ${n.toLocaleString('en-US')} is ${steps(setup, f)} steps, which takes about ${timeText(count(f, n), 1e9)}.`,
          watch: [setup.at(-1)!],
        };
      },
    },
  ];
}
