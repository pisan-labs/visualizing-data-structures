import type { PracticeKind } from '../../engine/types';
import { run } from '../_threads/machine';
import { randomPrefix, scheduleText } from '../_threads2/page';
import { patternOf, program, roomOf, type Pattern, type SemSettings } from './model';

const T = (t: number) => `T${t + 1}`;
const digits = (sched: number[]) => sched.map((t) => t + 1).join('');

const PATTERNS: Pattern[] = ['limit', 'first', 'turns'];

/** A setting for a question: a pattern, and for limit a room of 1 or 2. */
function pick(rng: { int(a: number, b: number): number }, sync = true): SemSettings {
  const pattern = PATTERNS[rng.int(0, 2)]!;
  return { pattern, sync, room: pattern === 'limit' ? rng.int(1, 2) : 2 };
}

/** The program in a sentence, for a prompt. */
function describe(settings: SemSettings): string {
  const pattern = patternOf(settings);
  if (pattern === 'limit') {
    const room = roomOf(settings);
    return settings.sync
      ? `Three threads each run P(s), print in, print out, V(s), with s starting at ${room}.`
      : 'Three threads each print in, then out, with no semaphore.';
  }
  if (pattern === 'first')
    return settings.sync
      ? 'T1 prints one, then calls V(a); T2 calls P(a), then prints two. a starts at 0.'
      : 'T1 prints one and T2 prints two, with no semaphore.';
  return settings.sync
    ? 'T1 runs P(a), print ping, V(b) twice; T2 runs P(b), print pong, V(a) twice. a starts at 1 and b at 0.'
    : 'T1 prints ping twice and T2 prints pong twice, with no semaphores.';
}

/** Practice for semaphores. Every answer comes from running the thread machine. */
export function semaphorePractice(): PracticeKind[] {
  return [
    {
      id: 'value',
      title: 'What is the semaphore’s value?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings = pick(rng);
          const p = program(settings);
          const sched = randomPrefix(rng, p, rng.int(2, 7));
          const end = run(p, sched).state;
          const sem = p.sems[rng.int(0, p.sems.length - 1)]!;
          const v = end.sems[sem.name]!.value;
          const waiting = end.sems[sem.name]!.waiters.map(T);
          if (v === sem.init && attempt < 30) continue;
          return {
            prompt: `${describe(settings)} Run the schedule \`${scheduleText(sched)}\` from the start: each number is the thread that takes the next step. What is ${sem.name} after it?`,
            setup: [],
            settings,
            answer: { kind: 'number', value: v },
            explain:
              v < 0
                ? `${sem.name} = ${v}: each P takes one and each V gives one back, and it went below 0 because ${list(waiting)} ${waiting.length > 1 ? 'are' : 'is'} waiting. A negative value counts the waiting threads.`
                : `${sem.name} = ${v}: it started at ${sem.init}; every P that ran took one and every V gave one back.${waiting.length ? '' : ' Nobody is waiting on it.'}`,
            watch: [['run', digits(sched)]],
          };
        }
      },
    },
    {
      id: 'printed',
      title: 'What has been printed?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings = pick(rng, rng.int(0, 3) > 0);
          const p = program(settings);
          const sched = randomPrefix(rng, p, rng.int(3, 10));
          const end = run(p, sched).state;
          const words = end.out.map((o) => o.text);
          if (words.length < 2 && attempt < 30) continue;
          if (!words.length) continue;
          return {
            prompt: `${describe(settings)} Run the schedule \`${scheduleText(sched)}\` from the start. What has been printed after it? Type the words in order.`,
            setup: [],
            settings,
            answer: { kind: 'sequence', value: words },
            explain: settings.sync
              ? `${words.join(' ')}. A thread that reaches P on a semaphore at 0 waits, so the words come out in the order the semaphores allow, not the order you might pick.`
              : `${words.join(' ')}. With no semaphores the words come out in exactly the order the scheduler picks.`,
            watch: [['run', digits(sched)]],
          };
        }
      },
    },
    {
      id: 'blocked',
      title: 'Which thread is blocked?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings = pick(rng);
          if (settings.pattern === 'limit') settings.room = 2;
          const p = program(settings);
          const sched = randomPrefix(rng, p, rng.int(1, 6));
          const ran = run(p, sched);
          const end = ran.state;
          const blocked = end.threads.flatMap((x, t) => (x.status === 'blocked' ? [t] : []));
          const woken = ran.events.filter((e) => e.blocked).map((e) => T(e.thread));
          if (blocked.length > 1) continue;
          if (blocked.length === 0 && rng.int(0, 2) > 0 && attempt < 30) continue;
          const options = [...p.threads.map((_, t) => T(t)), 'Nobody is blocked'];
          const answer = blocked.length ? T(blocked[0]!) : options.at(-1)!;
          const on = blocked.length ? end.threads[blocked[0]!]!.on!.name : '';
          return {
            prompt: `${describe(settings)} Run the schedule \`${scheduleText(sched)}\` from the start. Which thread is blocked after it?`,
            setup: [],
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(answer) },
            explain: blocked.length
              ? `${answer} called P(${on}) when ${on} was 0, so ${on} went to ${end.sems[on]!.value} and ${answer} waits for a V(${on}).`
              : woken.length
                ? `Nobody: ${list(woken)} waited on a P, but a V woke ${woken.length > 1 ? 'them' : 'it'} again.`
                : 'Nobody: every P so far found its semaphore above 0.',
            watch: [['run', digits(sched)]],
          };
        }
      },
    },
  ];
}

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
