import type { Rng } from '../../engine/rng';
import type { OpCall, PracticeKind } from '../../engine/types';
import { initState, interleavings, run, runnable, type MachineState } from '../_threads/machine';
import { expected, program, type RaceSettings } from './model';

const T = (t: number) => `T${t + 1}`;
const digits = (sched: number[]) => sched.map((t) => t + 1).join('');
const spaced = (sched: number[]) => sched.map((t) => t + 1).join(' ');

/** A random prefix of `len` steps, each by a thread that can run. */
function prefix(rng: Rng, settings: RaceSettings, len: number): number[] {
  const p = program(settings);
  let s = initState(p);
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const ready = runnable(s);
    if (!ready.length) break;
    const t = ready[rng.int(0, ready.length - 1)]!;
    out.push(t);
    s = run(p, [t], s).state;
  }
  return out;
}

/** The final counts of every way to finish from `from`. */
function finishes(settings: RaceSettings, from: MachineState): number[] {
  const p = program(settings);
  return interleavings(p, { from, outcome: (m) => String(m.mem.count) }).runs.map((r) =>
    Number(r.outcome),
  );
}

/** The setup that steps these threads one by one (each its own operation, as a learner would). */
const steps = (sched: number[]): OpCall[] => sched.map((t) => [`t${t + 1}`] as OpCall);

/** Practice for race conditions. Every answer is computed by running the thread machine. */
export function racePractice(): PracticeKind[] {
  return [
    {
      id: 'final-count',
      title: 'Where does count end?',
      make(rng) {
        const settings: RaceSettings = [
          { threads: 2, times: 1 },
          { threads: 3, times: 1 },
          { threads: 2, times: 2 },
        ][rng.int(0, 2)]!;
        const p = program(settings);
        const sched = prefix(rng, settings, 99);
        const writes: string[] = [];
        let state = initState(p);
        for (const t of sched) {
          const r = run(p, [t], state);
          state = r.state;
          if (r.events[0]!.instr.kind === 'store') writes.push(`${T(t)} stores ${state.mem.count}`);
        }
        const c = state.mem.count!;
        const e = expected(p);
        return {
          prompt: `${p.threads.length} threads each add 1 to count ${settings.times === 2 ? 'twice' : 'once'}. Run the schedule \`${spaced(sched)}\` from the start: each number is the thread that takes the next step (load, add or store). What is count at the end?`,
          setup: [],
          settings,
          answer: { kind: 'number', value: c },
          explain: `In order, ${writes.join(', ')}, so count ends at ${c}${c === e ? ', with nothing lost' : `: ${e - c === 1 ? 'one update' : `${e - c} updates`} of ${e} lost`}. A store writes whatever its thread loaded plus 1, however stale that is.`,
          watch: [['run', digits(sched)]],
        };
      },
    },
    {
      id: 'how-many-lose',
      title: 'How many interleavings lose an update?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings: RaceSettings =
            rng.int(0, 2) === 0 ? { threads: 3, times: 1 } : { threads: 2, times: 1 };
          const p = program(settings);
          const len =
            settings.threads === 3 ? rng.int(4, 6) : rng.int(0, 2) === 0 ? 0 : rng.int(1, 3);
          const pre = prefix(rng, settings, len);
          const from = run(p, pre).state;
          const ends = finishes(settings, from);
          const e = expected(p);
          const bad = ends.filter((c) => c < e).length;
          if ((ends.length < 3 || ends.length > 30) && attempt < 40) continue;
          const here = pre.length
            ? `The picture shows the threads after the steps \`${spaced(pre)}\`. From here`
            : 'From the start';
          return {
            prompt: `${here}, there are ${ends.length} ways to finish. How many of them lose at least one update (end with count below ${e})?`,
            setup: steps(pre),
            settings,
            answer: { kind: 'number', value: bad },
            explain:
              bad === 0
                ? `None: no thread is between its load and its store now, and ${ends.length === 1 ? 'only one thread is left' : 'every way to finish keeps them apart'}.`
                : bad === ends.length
                  ? `All ${ends.length}: two increments already overlap (both loaded before either stored), so one store overwrites the other whatever happens next.`
                  : `${bad} of the ${ends.length}. Nothing is lost only when no two increments overlap, each load coming after the store before it, and that happens in the other ${ends.length - bad}.`,
            watch: [['every']],
          };
        }
      },
    },
    {
      id: 'who-next',
      title: 'Which thread must step to lose an update?',
      make(rng) {
        const none = 'No single step makes it certain';
        for (let attempt = 0; ; attempt++) {
          const settings: RaceSettings =
            rng.int(0, 2) === 0 ? { threads: 3, times: 1 } : { threads: 2, times: 1 };
          const p = program(settings);
          const e = expected(p);
          const pre = prefix(rng, settings, rng.int(1, 4));
          const from = run(p, pre).state;
          // Already certain, or no way left to lose one: nothing to choose.
          const now = finishes(settings, from);
          if (now.every((c) => c < e) || now.every((c) => c === e)) {
            if (attempt < 60) continue;
          }
          const sure = runnable(from).filter((t) =>
            finishes(settings, run(p, [t], from).state).every((c) => c < e),
          );
          if (sure.length > 1 && attempt < 60) continue;
          if (sure.length === 0 && rng.int(0, 2) > 0 && attempt < 60) continue;
          const options = [...p.threads.map((_, t) => T(t)), none];
          const answer = sure.length === 1 ? T(sure[0]!) : none;
          const busy = from.threads.flatMap((x, i) =>
            x.pc % 3 !== 0 && x.status !== 'done' ? [i] : [],
          );
          return {
            prompt: `The picture shows the threads after the steps \`${spaced(pre)}\`. Which thread must take the next step so that an update is lost whatever happens after it?`,
            setup: steps(pre),
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(answer) },
            explain:
              sure.length === 1
                ? `${T(sure[0]!)} loads count while ${busy.map(T).join(' and ')} ${busy.length > 1 ? 'hold' : 'holds'} a copy that is not stored yet, so two stores will be based on the same count and one overwrites the other. Any other step still leaves a way for every increment to land.`
                : `Whichever thread steps next, there is still a way to finish with count = ${e}, so no single step makes the loss certain.`,
            watch: sure.length === 1 ? [[`t${sure[0]! + 1}`], ['every']] : [['every']],
          };
        }
      },
    },
  ];
}
