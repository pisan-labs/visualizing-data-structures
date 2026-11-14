import type { PracticeKind } from '../../engine/types';
import { scheduleText } from '../_threads2/page';
import { mrun } from '../_threads3/macro';
import { randomRows } from '../_threads3/page';
import { damaged, macro, node, retriesOf, stack, type CasSettings } from './model';

const T = (t: number) => `T${t + 1}`;
const digits = (sched: number[]) => sched.map((t) => t + 1).join('');

const counterText = (k: number) =>
  `${k} threads each add 1 to a shared n (starting at 0) without a lock: \`r = n\`, \`s = r + 1\`, \`ok = cas(n, r, s)\`, and if the cas failed, count a retry and go back to the read.`;

const plainText = (k: number) =>
  `${k} threads each add 1 to a shared n (starting at 0) with a plain store: \`r = n\`, \`s = r + 1\`, \`n = s\`.`;

const abaText =
  'A lock-free stack holds A → B → C (A on top). T1 pops: `old = top`, `nxt = old.next`, `ok = cas(top, old, nxt)`, and retries if the cas failed. T2 pops twice and pushes its first node back, each in one step.';

/** Practice for compare-and-swap. Every answer comes from running the thread machine. */
export function casPractice(): PracticeKind[] {
  return [
    {
      id: 'retries',
      title: 'How many retries?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings: CasSettings = { program: 'counter', threads: rng.int(2, 3) };
          const mac = macro(settings);
          const sched = randomRows(rng, mac, 200);
          const end = mrun(mac, sched).state;
          const r = retriesOf(end);
          if (r === 0 && attempt < 20 && rng.int(0, 3) > 0) continue;
          const each = end.threads.map((x, t) => `${T(t)} ${x.regs.retries ?? 0}`).join(', ');
          return {
            prompt: `${counterText(settings.threads)} Run the schedule \`${scheduleText(sched)}\` from the start: each number is the thread that takes the next step. How many retries are there in all?`,
            setup: [],
            settings,
            answer: { kind: 'number', value: r },
            explain: `${r} (${each}). A cas fails when another thread swapped n after this one read it; each failure costs one retry. n still ends at ${end.mem.n}.`,
            watch: [['run', digits(sched)]],
          };
        }
      },
    },
    {
      id: 'count',
      title: 'What is n at the end?',
      make(rng) {
        const cas = rng.int(0, 2) === 0;
        const settings: CasSettings = {
          program: cas ? 'counter' : 'plain',
          threads: rng.int(2, 3),
        };
        const mac = macro(settings);
        const sched = randomRows(rng, mac, 200);
        const end = mrun(mac, sched).state;
        const n = end.mem.n ?? 0;
        const k = settings.threads;
        return {
          prompt: `${cas ? counterText(k) : plainText(k)} Run the schedule \`${scheduleText(sched)}\` from the start. What is n at the end?`,
          setup: [],
          settings,
          answer: { kind: 'number', value: n },
          explain: cas
            ? `${n}. With the cas, a thread whose read went stale fails its swap and reads again, so no update is lost${retriesOf(end) ? ` (${retriesOf(end)} retries here)` : ''}.`
            : n === k
              ? `${n}. Nothing was lost this time: no thread read n while another was between its read and its write.`
              : `${n}, not ${k}. A plain store writes over whatever is there, so a thread that read a stale n wipes out ${k - n === 1 ? 'an update' : `${k - n} updates`}.`,
          watch: [['run', digits(sched)]],
        };
      },
    },
    {
      id: 'aba',
      title: 'Does this schedule hit ABA?',
      make(rng) {
        const settings: CasSettings = { program: 'aba', threads: 2 };
        const mac = macro(settings);
        const want = rng.int(0, 1) === 0;
        for (let attempt = 0; ; attempt++) {
          // T1's first read, then the rest at random: ABA needs T2 to run in T1's window.
          const sched =
            want && attempt < 60
              ? [0, ...randomRows(rng, mac, 200, mrun(mac, [0]).state)]
              : randomRows(rng, mac, 200);
          const end = mrun(mac, sched).state;
          const d = damaged(mac, end);
          if (d.length > 0 !== want && attempt < 120) continue;
          const options = [
            'Yes: T1’s cas succeeds on a top that changed and changed back',
            'No: the stack stays sound',
          ];
          const on = stack(end).map(node).join(' ') || 'empty';
          return {
            prompt: `${abaText} Run the schedule \`${scheduleText(sched)}\` from the start. Does it hit the ABA problem?`,
            setup: [],
            settings,
            answer: { kind: 'choice', options, correct: d.length ? 0 : 1 },
            explain: d.length
              ? `Yes. T2 popped A and B and pushed A back between T1’s reads and its cas, so the cas saw A and succeeded. It set top to the next T1 had read, B, which T2 still has: the stack is ${on}.`
              : `No. The stack ends as ${on}, and no node on it is in a thread’s hands. ${end.threads[0]!.regs.retries ? 'T1’s first cas failed because top had changed, as it should.' : 'Nothing changed top between T1’s read and its cas, or the cas noticed.'}`,
            watch: [['run', digits(sched)]],
          };
        }
      },
    },
  ];
}
