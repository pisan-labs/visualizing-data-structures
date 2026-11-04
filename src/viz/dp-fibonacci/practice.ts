import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, Step, VizDef } from '../../engine/types';
import { defaults, type FibExtra, type FibSettings, type FibState } from './model';

type Def = VizDef<FibState, FibSettings, FibExtra>;
type FibStep = Step<FibState, FibExtra>;

const MEMO: Settings = { style: 'memo' };
const BOTTOM_UP: Settings = { style: 'bottomup' };

/**
 * Practice questions for the Fibonacci table. Answers come from running the model with seed 1,
 * the way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function fibPractice(def: () => Def): PracticeKind[] {
  const steps = (settings: Settings, ops: OpCall[]): FibStep[] =>
    new Timeline(def(), { ...defaults, ...settings } as FibSettings, 1, ops).entries.at(-1)!.steps;
  /** The steps that store a value, in order: their `at` is the cell filled. */
  const fills = (ss: FibStep[]) => ss.filter((s) => s.level === 1 && s.extra?.at !== undefined);

  return [
    {
      id: 'next-value',
      title: 'Carry on the table',
      make(rng) {
        const m = rng.int(4, 9);
        const k = m + rng.int(1, 3);
        const run = steps(BOTTOM_UP, [['fib', k]]);
        const end = run.at(-1)!.state;
        const value = end.F[k]!;
        const more = end.F.slice(m + 1, k + 1).map((v, d) => `F(${m + 1 + d}) = ${v}`);
        return {
          prompt: `The table shows F(0) to F(${m}), filled from the bottom up. What is F(${k})?`,
          setup: [['fib', m]],
          settings: BOTTOM_UP,
          answer: { kind: 'number', value },
          explain: `Keep adding the last two values: ${more.join(', ')}.`,
          watch: [['fib', k]],
        };
      },
    },
    {
      id: 'memo-order',
      title: 'Which cell fills first?',
      make(rng) {
        const n = rng.int(4, 7);
        const order = fills(steps(MEMO, [['fib', n]])).map((s) => String(s.extra!.at));
        return {
          prompt: `Top-down, memoFib(${n}) filled this memo. Each call stores its answer just before it returns. Type the indices in the order the cells were filled.`,
          setup: [['fib', n]],
          settings: MEMO,
          answer: { kind: 'sequence', value: order },
          explain: `memoFib(${n}) asks for F(${n - 1}) first, which asks for F(${n - 2}), all the way down to F(1), the first call to finish. Then F(0), and the rest fill on the way back up: ${order.join(', ')}.`,
          watch: [['fib', n]],
        };
      },
    },
    {
      id: 'stack',
      title: 'What is on the call stack?',
      make(rng) {
        const n = rng.int(4, 7);
        const t = rng.int(0, n - 1);
        const fill = fills(steps(MEMO, [['fib', n]])).find((s) => s.extra!.at === t)!;
        const stack = (fill.extra!.stack ?? []).map(String);
        return {
          prompt: `Top-down, memoFib(${n}) filled this memo. Which calls were on the stack at the moment F[${t}] was stored? Type their arguments from memoFib(${n}) down.`,
          setup: [['fib', n]],
          settings: MEMO,
          answer: { kind: 'sequence', value: stack },
          explain:
            t === 0
              ? `F[0] is stored by memoFib(0), the second call made by memoFib(2). By then memoFib(1) has returned, so the stack is ${stack.join(', ')}.`
              : t === 1
                ? `Every call asks for F(k - 1) first, so the calls go straight down to memoFib(1), a base case. It stores F[1] while all the calls above it wait: ${stack.join(', ')}.`
                : `memoFib(${t}) stores F[${t}] once both of its calls have returned. The calls above it are still waiting for its answer: ${stack.join(', ')}.`,
          watch: [['fib', n]],
        };
      },
    },
    {
      id: 'calls',
      title: 'How many calls?',
      make(rng) {
        const n = rng.int(3, 12);
        const hits = rng.int(0, 1) === 1;
        const end = steps(MEMO, [['fib', n]]).at(-1)!;
        const calls = Number(end.vars?.calls);
        const found = Number(end.vars?.hits);
        const value = hits ? found : calls;
        return {
          prompt: hits
            ? `Top-down with a memo, how many calls to memoFib find their answer already in the memo while computing F(${n})?`
            : `Top-down with a memo, how many times is memoFib called in all while computing F(${n}), counting the first call?`,
          setup: [['fib', n]],
          settings: MEMO,
          answer: { kind: 'number', value },
          explain: `Each of F(0) to F(${n}) is worked out once: ${calls - found} calls fill a cell. Every call for k ≥ 3 also asks for F(k - 2), which is in the memo by then: ${found} hits. That makes ${calls} calls, 2n - 1 for n = ${n}.`,
          watch: [['fib', n]],
        };
      },
    },
  ];
}
