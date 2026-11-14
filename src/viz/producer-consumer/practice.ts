import type { PracticeKind } from '../../engine/types';
import { run } from '../_threads/machine';
import { finishes, randomPrefix, scheduleText, stepCalls } from '../_threads2/page';
import { good, outcome, program, syncOf, type PcSettings, type Sync } from './model';

const digits = (sched: number[]) => sched.map((t) => t + 1).join('');

function describe(settings: PcSettings): string {
  const sync = syncOf(settings);
  const how =
    sync === 'sem'
      ? 'two semaphores (spaces and items) and a mutex'
      : `a mutex and two condition variables, checking in ${sync === 'while' ? 'a while loop' : 'an if'}`;
  return `A buffer of size ${settings.size} starts with ${settings.start === 1 ? 'one item' : 'nothing'} in it. P1 puts one item and C1 and C2 each take one, with ${how}. The threads are numbered 1 = P1, 2 = C1, 3 = C2.`;
}

const pick = (rng: { int(a: number, b: number): number }, syncs: Sync[]): PcSettings => ({
  sync: syncs[rng.int(0, syncs.length - 1)]!,
  size: rng.int(1, 2),
  start: rng.int(0, 1),
});

/** Practice for the bounded buffer. Every answer comes from running the thread machine. */
export function pcPractice(): PracticeKind[] {
  return [
    {
      id: 'buffer',
      title: 'How full is the buffer?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings = pick(rng, ['while', 'while', 'sem']);
          const p = program(settings);
          const sched = randomPrefix(rng, p, rng.int(4, 14));
          const end = run(p, sched).state;
          const n = end.mem.n ?? 0;
          if (n === settings.start && attempt < 20) continue;
          return {
            prompt: `${describe(settings)} Run the schedule \`${scheduleText(sched)}\` from the start. How many items are in the buffer after it?`,
            setup: [],
            settings,
            answer: { kind: 'number', value: n },
            explain: `${n}: it started with ${settings.start}, the producer's store adds one and each consumer's store takes one away. Only the stores change n; a check or a wait just looks.`,
            watch: [['run', digits(sched)]],
          };
        }
      },
    },
    {
      id: 'asleep',
      title: 'Who is asleep, and why?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings = pick(rng, ['while', 'while', 'sem']);
          const p = program(settings);
          const sched = randomPrefix(rng, p, rng.int(2, 9));
          const end = run(p, sched).state;
          const asleep = end.threads.flatMap((x, t) =>
            x.status === 'blocked' && x.on?.kind !== 'lock' ? [t] : [],
          );
          if (asleep.length > 1) continue;
          if (asleep.length === 0 && rng.int(0, 2) > 0 && attempt < 30) continue;
          const options = [
            'P1: the buffer is full',
            'C1: the buffer is empty',
            'C2: the buffer is empty',
            'Nobody is asleep',
          ];
          const answer = asleep.length ? options[asleep[0]!]! : options[3]!;
          const holder = end.locks.m!.holder;
          const forLock = end.locks.m!.waiters.map((t) => p.threads[t]!.name);
          return {
            prompt: `${describe(settings)} Run the schedule \`${scheduleText(sched)}\` from the start. Which thread is asleep on a condition variable or a semaphore after it, and why?`,
            setup: [],
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(answer) },
            explain: asleep.length
              ? `${answer}. ${end.threads[asleep[0]!]!.on!.kind === 'sem' ? `Its P(${end.threads[asleep[0]!]!.on!.name}) found the semaphore at 0 (every ${asleep[0] === 0 ? 'space' : 'item'} is taken or already claimed), so it waits for a V.` : `It found n = ${asleep[0] === 0 ? settings.size : 0} and went to sleep until ${asleep[0] === 0 ? 'a consumer makes room' : 'the producer puts an item'}.`}${forLock.length ? ` ${forLock.join(' and ')} ${forLock.length > 1 ? 'wait' : 'waits'} for the lock m, which is not the same thing.` : ''}`
              : `Nobody.${forLock.length ? ` ${forLock.join(' and ')} ${forLock.length > 1 ? 'wait' : 'waits'} for the lock m${holder === null ? '' : `, which ${p.threads[holder]!.name} holds`}, but that is a short wait for a lock, not sleep on a condition.` : ' No thread has found the buffer full or empty and stayed asleep.'}`,
            watch: [['run', digits(sched)]],
          };
        }
      },
    },
    {
      id: 'if-bug',
      title: 'Can the if go wrong from here?',
      make(rng) {
        const settings: PcSettings = { sync: 'if', size: 1, start: 0 };
        const p = program(settings);
        const options = [
          'Yes, whatever the scheduler does next',
          'Yes, in some of the ways to finish',
          'No, in none of them',
        ];
        // Aim for each of the three answers about equally often.
        const want = rng.int(0, 2);
        for (let attempt = 0; ; attempt++) {
          const pre = randomPrefix(rng, p, rng.int(2, 10));
          const from = run(p, pre).state;
          const ends = finishes(p, from, (m) => outcome(p, m, settings));
          if (ends.length < 2 && attempt < 200) continue;
          const bad = ends.filter((o) => !good(o)).length;
          const k = bad === ends.length ? 0 : bad > 0 ? 1 : 2;
          if (k !== want && attempt < 100) continue;
          return {
            prompt: `${describe(settings)} The picture shows the threads after the steps \`${scheduleText(pre)}\`. Can a consumer still end up taking an item that is not there (n = -1)?`,
            setup: stepCalls(pre),
            settings,
            answer: { kind: 'choice', options, correct: k },
            explain:
              k === 0
                ? `Yes, in all ${ends.length} ways to finish. A consumer has already passed its if and will take an item when it gets the lock, but the other consumer gets there first.`
                : k === 1
                  ? `In ${bad} of the ${ends.length} ways to finish. It goes wrong when a consumer is woken, and before it gets the lock back the other consumer takes the item.`
                  : `No: from here every way to finish is safe. ${ends.length === 1 ? 'There is only one way left.' : 'No consumer can be woken with the item already gone.'}`,
            watch: [['every']],
          };
        }
      },
    },
  ];
}
