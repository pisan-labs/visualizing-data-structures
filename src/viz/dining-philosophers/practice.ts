import type { PracticeKind } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { deadlockCycle } from '../_threads/deadlock';
import { runnable, stuck } from '../_threads/machine';
import { scheduleText, stepCalls } from '../_threads2/page';
import { mcount, mfind, mrun, mstep } from '../_threads3/macro';
import { randomRows } from '../_threads3/page';
import {
  countOf,
  cycleText,
  forkOrder,
  fork,
  macro,
  outcome,
  type DiningSettings,
  type Fix,
} from './model';

const P = (t: number) => `P${t + 1}`;
const digits = (sched: number[]) => sched.map((t) => t + 1).join('');

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The program in a sentence: each philosopher's two forks, in its order. */
function orders(settings: DiningSettings): string {
  const n = countOf(settings);
  const fix = settings.fix as Fix;
  const each = Array.from({ length: n }, (_, t) => {
    const [a, b] = forkOrder(n, fix, t);
    return `${P(t)} takes ${fork(a)}, then ${fork(b)}`;
  }).join('; ');
  return `${n} philosophers: ${each}${fix === 'waiter' ? `; and each first asks a waiter for a seat (a semaphore that starts at ${n - 1})` : ''}. Each eats, then puts both forks down.`;
}

/** Practice for dining philosophers. Every answer comes from running the thread machine. */
export function diningPractice(): PracticeKind[] {
  return [
    {
      id: 'deadlocked',
      title: 'Is this schedule deadlocked?',
      make(rng) {
        const options = [
          'Yes: nobody can ever go on',
          'No: some philosopher can still step',
          'No: everyone has eaten',
        ];
        const want = rng.int(0, 2);
        for (let attempt = 0; ; attempt++) {
          const settings: DiningSettings = {
            philosophers: rng.int(3, 4),
            fix: want === 0 || rng.int(0, 2) > 0 ? 'none' : rng.int(0, 1) ? 'order' : 'waiter',
          };
          const mac = macro(settings);
          const n = countOf(settings);
          let sched: number[];
          if (want === 0) {
            // Everyone picks up a first fork, then everyone reaches for the second.
            sched = [...shuffle(rng, [...Array(n).keys()]), ...shuffle(rng, [...Array(n).keys()])];
          } else if (want === 2) sched = randomRows(rng, mac, 200);
          else sched = randomRows(rng, mac, rng.int(3, 3 * n));
          const r = mrun(mac, sched);
          sched = sched.slice(0, r.steps.length);
          const end = r.state;
          const k = stuck(end) ? 0 : runnable(end).length ? 1 : 2;
          if (k !== want && attempt < 80) continue;
          const c = deadlockCycle(end);
          return {
            prompt: `${orders(settings)} Run the schedule \`${scheduleText(sched)}\` from the start: each number is the philosopher who takes the next step. Is the table deadlocked after it?`,
            setup: [],
            settings,
            answer: { kind: 'choice', options, correct: k },
            explain:
              k === 0
                ? `Yes. ${c ? `Each philosopher holds one fork and waits for the next one’s: the cycle ${cycleText(c)}.` : ''} Nobody can eat, so nobody ever puts a fork down.`
                : k === 1
                  ? `No. ${runnable(end).map(P).join(' and ')} can still step${end.threads.some((x) => x.status === 'blocked') ? ', even though some philosopher waits' : ''}. A wait is a deadlock only when it closes a cycle.`
                  : `No. Everyone got both forks in turn and ate: ${end.out.map((o) => P(o.thread)).join(', ')}.`,
            watch: [['run', digits(sched)]],
          };
        }
      },
    },
    {
      id: 'fix',
      title: 'Which fix does this program use?',
      make(rng) {
        const fixes: Fix[] = ['none', 'order', 'waiter'];
        const fix = fixes[rng.int(0, 2)]!;
        const settings: DiningSettings = { philosophers: rng.int(3, 4), fix };
        const mac = macro(settings);
        const n = countOf(settings);
        const options = [
          'None: it can deadlock',
          'One philosopher takes its forks in the other order',
          'A waiter lets at most n − 1 sit at once',
        ];
        const bad = mfind(mac, (s) => stuck(s));
        const c = mcount(mac, { outcome: (s) => outcome(mac, s) });
        const total = c.total.toLocaleString('en-US');
        return {
          prompt: `The picture shows ${n} philosophers’ steps, one lane each, before anyone moves. Which fix for deadlock does this program use?`,
          setup: [],
          settings,
          answer: { kind: 'choice', options, correct: fixes.indexOf(fix) },
          explain:
            fix === 'none'
              ? `None: every philosopher picks up its left fork first. For example \`${scheduleText(bad ?? [])}\` ends with each holding one fork and waiting for the next: deadlock.`
              : fix === 'order'
                ? `${P(n - 1)} picks up ${fork(0)}, its right fork, first, so every philosopher takes the lower-numbered fork first: one global order. All ${total} interleavings finish.`
                : `Every philosopher first calls P(waiter), and waiter starts at ${n - 1}, so at most ${n - 1} reach for forks at once and one of them always gets both. All ${total} interleavings finish.`,
          watch: [['every']],
        };
      },
    },
    {
      id: 'next',
      title: 'Who eats next?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings: DiningSettings = {
            philosophers: rng.int(3, 4),
            fix: (['none', 'none', 'order', 'waiter'] as Fix[])[rng.int(0, 3)]!,
          };
          const mac = macro(settings);
          const n = countOf(settings);
          const prefix = randomRows(rng, mac, rng.int(2, 2 * n));
          const start = mrun(mac, prefix).state;
          if (!runnable(start).length) continue;
          // Round robin from here until somebody eats (or nobody can step).
          let s = start;
          const rr: number[] = [];
          let eater: number | null = null;
          while (eater === null && runnable(s).length && rr.length < 60) {
            for (const t of runnable(s)) {
              const before = s.out.length;
              const r = mstep(mac, s, t);
              if (!r.ok) continue;
              s = r.state;
              rr.push(t);
              if (s.out.length > before) {
                eater = s.out.at(-1)!.thread;
                break;
              }
            }
          }
          if (eater === null && attempt < 40 && rng.int(0, 2) > 0) continue;
          const options = [...Array.from({ length: n }, (_, t) => P(t)), 'Nobody: they deadlock'];
          const correct = eater === null ? n : eater;
          return {
            prompt: `${orders(settings)} The picture shows the table after the steps \`${scheduleText(prefix)}\`. From here, each philosopher who can step takes one step in turn, lowest number first, round and round. Who eats next?`,
            setup: stepCalls(prefix),
            settings,
            answer: { kind: 'choice', options, correct },
            explain:
              eater === null
                ? `Nobody. The steps \`${scheduleText(rr)}\` leave every philosopher holding one fork and waiting for the next one’s.`
                : `${P(eater)}: after \`${scheduleText(rr)}\` it holds both its forks and eats first.`,
            watch: stepCalls(rr),
          };
        }
      },
    },
  ];
}
