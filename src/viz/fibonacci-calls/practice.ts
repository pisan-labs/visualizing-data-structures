import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { plural } from '../_recursion/kit';
import { defaults, type FibSettings, type FibState, type Memo } from './model';

type Def = VizDef<FibState, FibSettings, undefined>;

/**
 * Practice questions for the Fibonacci call tree. Every answer comes from running the model, so
 * it always agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function fibPractice(def: () => Def): PracticeKind[] {
  const steps = (memo: Memo, calls: OpCall[]): Step<FibState, undefined>[] => {
    const t = new Timeline(def(), { ...defaults, memo }, 1, calls);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const callsOf = (memo: Memo, n: number) => Number(steps(memo, [['fib', n]]).at(-1)!.vars?.calls);

  return [
    {
      id: 'count-calls',
      title: 'How many calls?',
      make(rng) {
        const n = rng.int(4, 6);
        const whole = callsOf('none', n - 1);
        const left = callsOf('none', n - 2);
        const value = callsOf('none', n);
        return {
          prompt: `The picture shows every call \`fib(${n - 1})\` makes. Without the memo, how many calls does \`fib(${n})\` make in all, counting the first one?`,
          setup: [['fib', n - 1]],
          settings: { memo: 'none' },
          answer: { kind: 'number', value },
          explain: `\`fib(${n})\` is one call, plus everything \`fib(${n - 1})\` does (the whole picture: ${whole} calls), plus everything \`fib(${n - 2})\` does (its left subtree: ${left} calls). 1 + ${whole} + ${left} = ${value}.`,
          watch: [['fib', n]],
        };
      },
    },
    {
      id: 'repeats',
      title: 'How often is it computed?',
      make(rng) {
        const n = rng.int(5, 6);
        const k = rng.int(2, n - 2);
        const countOf = (m: number) => steps('none', [['fib', m]]).at(-1)!.state.counts[k] ?? 0;
        const times = countOf(n);
        const left = countOf(n - 1);
        const right = countOf(n - 2);
        return {
          prompt: `The picture shows \`fib(${n - 1})\` and how often it called each fib(k). Now \`fib(${n})\` runs, without the memo. How many times is \`fib(${k})\` called?`,
          setup: [['fib', n - 1]],
          settings: { memo: 'none' },
          answer: { kind: 'number', value: times },
          explain: `\`fib(${n})\` calls \`fib(${n - 1})\`, which calls \`fib(${k})\` ${left} ${left === 1 ? 'time' : 'times'} (the table), and \`fib(${n - 2})\`, which calls it ${right} ${right === 1 ? 'time' : 'times'} (the left subtree of the picture). ${left} + ${right} = ${times}, a Fibonacci number again, and each of those ${plural(times, 'call')} redoes the whole subtree of \`fib(${k})\`.`,
          watch: [['fib', n]],
        };
      },
    },
    {
      id: 'memo-calls',
      title: 'Calls with a memo',
      make(rng) {
        const m = rng.int(3, 4);
        const n = rng.int(6, 10);
        const value = callsOf('memo', n);
        return {
          prompt: `With the memo on, the picture shows \`fib(${m})\`. How many calls does \`fib(${n})\` make with the memo, counting the first one?`,
          setup: [['fib', m]],
          settings: { memo: 'memo' },
          answer: { kind: 'number', value },
          explain: `Only the left edge is computed: fib(${n}) down to fib(2), ${n - 1} calls, plus fib(1) and fib(0) under fib(2). Each computed call above fib(2) also makes a second call, which the memo or a base case answers at once: ${n - 2} more. ${n - 1} + 2 + ${n - 2} = ${value}, against ${callsOf('none', n)} without the memo.`,
          watch: [['fib', n]],
        };
      },
    },
    {
      id: 'order',
      title: 'The order calls happen',
      make(rng) {
        const n = rng.int(4, 5);
        const k = rng.int(6, 8);
        const order = steps('none', [['fib', n]])
          .filter((s) => s.lines.length === 1 && ['sig', 'x', 'y'].includes(s.lines[0]!))
          .map((s) => String(s.vars?.n))
          .slice(0, k);
        return {
          prompt: `The picture shows the calls \`fib(${n - 1})\` makes. Now \`fib(${n})\` runs, without the memo. Type n for each of its first ${k} calls, in the order they start, separated by spaces.`,
          setup: [['fib', n - 1]],
          settings: { memo: 'none' },
          answer: { kind: 'sequence', value: order },
          explain: `Each call finishes its first call, \`fib(n - 1)\`, with everything below it, before it starts \`fib(n - 2)\`. So \`fib(${n})\` starts, then all of \`fib(${n - 1})\` runs in the order of the picture, and only then \`fib(${n - 2})\`: ${order.join(' ')}.`,
          watch: [['fib', n]],
        };
      },
    },
  ];
}
