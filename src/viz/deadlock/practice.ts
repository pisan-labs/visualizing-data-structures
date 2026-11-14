import type { PracticeKind } from '../../engine/types';
import { findSchedule, run, stuck, type MachineState } from '../_threads/machine';
import { randomPrefix, scheduleText, stepCalls } from '../_threads2/page';
import { cycleOf, lockOrder, program, type DeadlockSettings, type Order } from './model';

const T = (t: number) => `T${t + 1}`;
const digits = (sched: number[]) => sched.map((t) => t + 1).join('');

/** The lock orders in words: "T1 takes a, then b; T2 takes b, then a". */
function orders(settings: DeadlockSettings): string {
  const k = settings.threads;
  return Array.from({ length: k }, (_, t) => {
    const [x, y] = lockOrder(settings.order as Order, t);
    return `${T(t)} takes ${x}, then ${y}`;
  }).join('; ');
}

const intro = (settings: DeadlockSettings) =>
  `Each thread locks two locks, then unlocks them in reverse: ${orders(settings)}.`;

/** Practice for deadlock. Every answer comes from running the thread machine. */
export function deadlockPractice(): PracticeKind[] {
  return [
    {
      id: 'deadlocked',
      title: 'Is this schedule deadlocked?',
      make(rng) {
        const options = [
          'Yes: no thread can ever run again',
          'No: some thread can still step',
          'No: every thread is done',
        ];
        const want = rng.int(0, 2);
        for (let attempt = 0; ; attempt++) {
          const settings: DeadlockSettings = { threads: rng.int(2, 3), order: 'opposite' };
          const p = program(settings);
          const sched = randomPrefix(rng, p, rng.int(2, 4 * settings.threads + 2));
          const end = run(p, sched).state;
          const k = stuck(end) ? 0 : end.threads.every((x) => x.status === 'done') ? 2 : 1;
          if (k !== want && attempt < 60) continue;
          const c = cycleOf(end);
          return {
            prompt: `${intro(settings)} Run the schedule \`${scheduleText(sched)}\` from the start: each number is the thread that takes the next step. Is the program deadlocked after it?`,
            setup: [],
            settings,
            answer: { kind: 'choice', options, correct: k },
            explain:
              k === 0
                ? `Yes. ${c ? `${c.map((t, i) => `${T(t)} waits for ${T(c[(i + 1) % c.length]!)}`).join(' and ')}: a cycle in the wait-for graph.` : ''} No thread can run, and none ever will.`
                : k === 1
                  ? `No. ${end.threads.flatMap((x, t) => (x.status === 'ready' ? [T(t)] : [])).join(' and ')} can still step${end.threads.some((x) => x.status === 'blocked') ? ', even though some thread waits' : ''}. A wait is only a deadlock when it closes a cycle.`
                  : 'No. Every thread got both locks in turn and let go of them.',
            watch: [['run', digits(sched)]],
          };
        }
      },
    },
    {
      id: 'cycle',
      title: 'Which threads are on the cycle?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings: DeadlockSettings = {
            threads: rng.int(0, 3) === 0 ? 2 : 3,
            order: 'opposite',
          };
          const p = program(settings);
          const sched = randomPrefix(rng, p, 30);
          const end = run(p, sched).state;
          const c = cycleOf(end);
          if (!c) continue;
          const on = [...c].sort((a, b) => a - b).map(T);
          const off = end.threads.flatMap((x, t) =>
            x.status === 'blocked' && !c.includes(t) ? [T(t)] : [],
          );
          if (settings.threads === 3 && off.length === 0 && attempt < 30) continue;
          return {
            prompt: `${intro(settings)} The picture shows the threads after the steps \`${scheduleText(sched)}\`: no thread can run. Which threads are on the cycle of the wait-for graph? Type them, lowest number first.`,
            setup: stepCalls(sched),
            settings,
            answer: { kind: 'sequence', value: on },
            explain: `${on.join(' and ')}: ${c.map((t, i) => `${T(t)} waits for a lock ${T(c[(i + 1) % c.length]!)} holds`).join(', and ')}.${off.length ? ` ${off.join(' and ')} ${off.length > 1 ? 'are' : 'is'} stuck too, but only waiting behind the cycle: nobody waits for ${off.length > 1 ? 'them' : 'it'}.` : ''}`,
            watch: [['cycle']],
          };
        }
      },
    },
    {
      id: 'fixed',
      title: 'Can these lock orders deadlock?',
      make(rng) {
        const settings: DeadlockSettings = {
          threads: rng.int(2, 3),
          order: rng.int(0, 1) === 0 ? 'opposite' : 'global',
        };
        const p = program(settings);
        const bad = findSchedule(p, (m: MachineState) => stuck(m));
        const options = ['Yes, some schedule deadlocks', 'No, every schedule finishes'];
        return {
          prompt: `${intro(settings)} Can some schedule of these threads end in deadlock?`,
          setup: [],
          settings,
          answer: { kind: 'choice', options, correct: bad ? 0 : 1 },
          explain: bad
            ? `Yes: for example \`${scheduleText(bad)}\`. T2 takes the locks in the other order, so it can hold b while another thread holds a, and each waits for the other.`
            : 'No: every thread takes a before b, so whoever holds b already holds a, and nobody can hold b while waiting for a. The wait-for graph never gets a cycle.',
          watch: [['every']],
        };
      },
    },
  ];
}
