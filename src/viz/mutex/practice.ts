import type { PracticeKind } from '../../engine/types';
import { run, type MachineState } from '../_threads/machine';
import { finishes, randomPrefix, scheduleText, stepCalls } from '../_threads2/page';
import { contention, program, type LockMode, type MutexSettings } from './model';

const T = (t: number) => `T${t + 1}`;
const spaced = (sched: number[]) => scheduleText(sched);
const digits = (sched: number[]) => sched.map((t) => t + 1).join('');

/** The final counts of every way to finish from a state (stuck runs count by their count). */
function finalCounts(settings: MutexSettings, from: MachineState): number[] {
  const p = program(settings);
  return finishes(p, from, (m) => String(m.mem.count)).map(Number);
}

/** Practice for the mutex page. Every answer comes from running the thread machine. */
export function mutexPractice(): PracticeKind[] {
  return [
    {
      id: 'holder',
      title: 'Who holds the lock?',
      make(rng) {
        const settings: MutexSettings = {
          threads: rng.int(2, 3),
          lock: rng.int(0, 3) === 0 ? 'forget' : 'lock',
        };
        const p = program(settings);
        const sched = randomPrefix(rng, p, rng.int(3, 3 * settings.threads + 1));
        const end = run(p, sched).state;
        const h = end.locks.m!.holder;
        const options = [...p.threads.map((_, t) => T(t)), 'Nobody: m is free'];
        const answer = h === null ? options.at(-1)! : T(h);
        const line = end.locks.m!.waiters.map(T);
        return {
          prompt: `${settings.threads} threads each lock m, add 1 to count and unlock m${settings.lock === 'forget' ? ', except T1, which never unlocks' : ''}. Run the schedule \`${spaced(sched)}\` from the start: each number is the thread that takes the next step. Who holds m after it?`,
          setup: [],
          settings,
          answer: { kind: 'choice', options, correct: options.indexOf(answer) },
          explain:
            h === null
              ? `Nobody: every thread that took m has let go of it, and nobody is waiting. A lock call that finds m held still counts as a step: the thread joins the line and takes no more steps until it is handed m.`
              : `${T(h)} holds m${line.length ? `, and ${line.join(', ')} ${line.length > 1 ? 'wait' : 'waits'} in line` : ''}. ${end.threads[h]!.status === 'done' ? `${T(h)} is done without unlocking, so it holds m for ever.` : 'A thread holds m from its lock(m) until its unlock(m); unlock hands m straight to the first in line.'}`,
          watch: [['run', digits(sched)]],
        };
      },
    },
    {
      id: 'outcomes',
      title: 'How many outcomes remain?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const modes: LockMode[] = ['lock', 'lock', 'store', 'none'];
          const settings: MutexSettings = {
            threads: rng.int(0, 2) === 0 ? 3 : 2,
            lock: modes[rng.int(0, modes.length - 1)]!,
          };
          const p = program(settings);
          const pre = randomPrefix(rng, p, rng.int(0, 4));
          const from = run(p, pre).state;
          const ends = finalCounts(settings, from);
          if ((ends.length < 2 || ends.length > 400) && attempt < 40) continue;
          const distinct = [...new Set(ends)].sort((a, b) => a - b);
          const here = pre.length
            ? `The picture shows the threads after the steps \`${spaced(pre)}\`. From here`
            : 'From the start';
          const how =
            settings.lock === 'lock'
              ? 'each thread holds m around its load, add and store'
              : settings.lock === 'store'
                ? 'each thread locks m around its store only'
                : 'there is no lock';
          return {
            prompt: `${settings.threads} threads each add 1 to count, and ${how}. ${here}, the threads can finish in ${ends.length} different orders. How many different final values of count can they end with?`,
            setup: stepCalls(pre),
            settings,
            answer: { kind: 'number', value: distinct.length },
            explain:
              distinct.length === 1
                ? `Just one: every order ends with count = ${distinct[0]}. ${settings.lock === 'lock' ? 'The lock keeps each load, add and store together, so no two increments overlap.' : 'The steps already taken have decided it.'}`
                : `${distinct.length}: count can end at ${distinct.join(', ')}. Without the load inside the lock, two threads can still both load the same count, and one store wipes out the other.`,
            watch: [['every']],
          };
        }
      },
    },
    {
      id: 'waiting',
      title: 'Who is first in line?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings: MutexSettings = { threads: rng.int(2, 3), lock: 'lock' };
          const p = program(settings);
          const sched = randomPrefix(rng, p, rng.int(2, 9));
          const end = run(p, sched).state;
          const line = end.locks.m!.waiters;
          if (line.length === 0 && rng.int(0, 2) > 0 && attempt < 40) continue;
          const options = [...p.threads.map((_, t) => T(t)), 'Nobody is waiting'];
          const answer = line.length ? T(line[0]!) : options.at(-1)!;
          const h = end.locks.m!.holder;
          const waited = contention(p, end).waited;
          return {
            prompt: `${settings.threads} threads each lock m, add 1 to count and unlock. Run the schedule \`${spaced(sched)}\` from the start. Which thread is first in line for m after it?`,
            setup: [],
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(answer) },
            explain: line.length
              ? `${T(line[0]!)} asked for m while ${h === null ? 'it was held' : `${T(h)} held it`}${line.length > 1 ? `, before ${line.slice(1).map(T).join(' and ')}` : ''}, so it is first in line and gets m when it is unlocked.${waited ? ` Waiting so far adds up to ${waited} ${waited === 1 ? 'step' : 'steps'}.` : ''}`
              : `Nobody: ${h === null ? 'm is free' : `${T(h)} holds m`}, and no thread has asked for it while it was held.`,
            watch: [['run', digits(sched)]],
          };
        }
      },
    },
  ];
}
