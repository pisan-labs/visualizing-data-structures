import type { PracticeKind } from '../../engine/types';
import type { MachineState } from '../_threads/machine';
import { scheduleText, stepCalls } from '../_threads2/page';
import { mfind, mrun, mstep, type Macro } from '../_threads3/macro';
import { randomRows } from '../_threads3/page';
import { history, inside, kinds, macro, type RwSettings, type Variant } from './model';

const names = (mac: Macro, sched: number[]) => sched.map((t) => mac.p.threads[t]!.name).join(' ');

const describeVariant = (v: Variant, k: number) =>
  v === 'mutex'
    ? `A writer W and ${k} readers share one lock m: each takes m, reads or writes, and lets go.`
    : v === 'turnstile'
      ? `A writer W and ${k} readers share a read-write lock with a turnstile: readers pass the turnstile, then go in through the lightswitch (the first reader in takes room, the last out gives it back); the writer holds the turnstile while it waits for room.`
      : `A writer W and ${k} readers share a read-write lock, readers first: the first reader in takes the semaphore room, the last out gives it back, and the writer takes room for itself.`;

/** Has thread t not yet got into the room (and is not done)? */
function outside(mac: Macro, s: MachineState, t: number, settings: RwSettings): boolean {
  if (s.threads[t]!.status === 'done' || inside(mac, s, t, settings)) return false;
  const at = kinds(settings, t).indexOf(t === 0 ? 'write' : 'read');
  return mac.rows[t]![at]!.from > s.threads[t]!.pc;
}

/** Steps of t alone until it is in the room; null if it blocks or ends first. */
function alone(mac: Macro, s: MachineState, t: number, settings: RwSettings): number[] | null {
  const out: number[] = [];
  let cur = s;
  for (let i = 0; i < 12; i++) {
    if (inside(mac, cur, t, settings)) return out;
    const r = mstep(mac, cur, t);
    if (!r.ok) return null;
    cur = r.state;
    out.push(t);
    if (cur.threads[t]!.status === 'blocked') return null;
  }
  return null;
}

/** Practice for readers and writers. Every answer comes from running the thread machine. */
export function rwPractice(): PracticeKind[] {
  const variants: Variant[] = ['readers', 'readers', 'turnstile', 'mutex'];
  return [
    {
      id: 'enter',
      title: 'Who may enter now?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings: RwSettings = {
            variant: variants[rng.int(0, 3)]!,
            readers: rng.int(2, 3),
          };
          const mac = macro(settings);
          const prefix = randomRows(rng, mac, rng.int(2, 9));
          const s = mrun(mac, prefix).state;
          const waiting = mac.p.threads
            .map((_, t) => t)
            .filter((t) => outside(mac, s, t, settings));
          if (waiting.length < 2) continue;
          const can = waiting.filter((t) => alone(mac, s, t, settings) !== null);
          if (can.length > 1 && attempt < 200) continue;
          if (can.length > 1) continue;
          const options = [...waiting.map((t) => mac.p.threads[t]!.name), 'Nobody'];
          const who = can[0];
          const ins = mac.p.threads
            .map((th, t) => (inside(mac, s, t, settings) ? th.name : ''))
            .filter(Boolean);
          return {
            prompt: `${describeVariant(settings.variant as Variant, settings.readers as number)} The picture shows them after the steps \`${scheduleText(prefix)}\`. Of the threads not yet in the room (${options.slice(0, -1).join(', ')}), which one could get in now, stepping on its own?`,
            setup: stepCalls(prefix),
            settings,
            answer: {
              kind: 'choice',
              options,
              correct:
                who === undefined ? options.length - 1 : options.indexOf(mac.p.threads[who]!.name),
            },
            explain:
              who === undefined
                ? `Nobody: ${ins.length ? `${ins.join(' and ')} ${ins.length > 1 ? 'are' : 'is'} inside, and ` : ''}every one of them would have to wait (for room, for m or at the turnstile).`
                : `${mac.p.threads[who]!.name}: \`${names(mac, alone(mac, s, who, settings)!)}\` takes it in without waiting. ${who === 0 ? 'The room is empty, so the writer can have it.' : ins.length ? 'Readers are inside already, so another reader may join them.' : 'Nobody is inside, so a reader may take the room.'}`,
            watch: stepCalls(alone(mac, s, who ?? 0, settings) ?? []),
          };
        }
      },
    },
    {
      id: 'inside',
      title: 'How many readers are inside?',
      make(rng) {
        for (let attempt = 0; ; attempt++) {
          const settings: RwSettings = {
            variant: attempt % 3 ? 'readers' : 'turnstile',
            readers: rng.int(2, 3),
          };
          const mac = macro(settings);
          const sched = randomRows(rng, mac, rng.int(3, 12));
          const s = mrun(mac, sched).state;
          const k = mac.p.threads.filter((_, t) => t > 0 && inside(mac, s, t, settings)).length;
          if (k === 0 && attempt < 30 && rng.int(0, 2) > 0) continue;
          const n = s.mem.n ?? 0;
          return {
            prompt: `${describeVariant(settings.variant as Variant, settings.readers as number)} Run the schedule \`${scheduleText(sched)}\` from the start: each name is the thread that takes the next step. How many readers are in the room after it?`,
            setup: [],
            settings,
            answer: { kind: 'number', value: k },
            explain:
              n === k
                ? `${k}, and n = ${n} counts them: a reader adds itself to n on the way in and takes itself off on the way out, both while it holds m.`
                : `${k}, though n = ${n}: ${n > k ? 'a reader has added itself to n but is not in yet (it waits for room, or still holds m on its way in)' : 'a reader is on its way out'}.`,
            watch: [['run', sched.map((t) => t + 1).join('')]],
          };
        }
      },
    },
    {
      id: 'starve',
      title: 'Can the writer be overtaken?',
      make(rng) {
        const v = (['readers', 'turnstile', 'mutex'] as Variant[])[rng.int(0, 2)]!;
        const settings: RwSettings = { variant: v, readers: 2 };
        const mac = macro(settings);
        const bad = mfind(mac, (s) => history(s).overtaken);
        const options = [
          'Yes: a reader who comes while the writer waits can still get in first',
          'No: readers who come while the writer waits go in after it',
        ];
        return {
          prompt: `${describeVariant(v, 2)} Can a reader who comes while the writer is waiting get into the room before the writer?`,
          setup: [],
          settings,
          answer: { kind: 'choice', options, correct: bad ? 0 : 1 },
          explain: bad
            ? `Yes. For example \`${names(mac, bad)}\`: a reader is inside, the writer waits for room, and the next reader joins the one inside, because only the first reader in ever takes room. With readers always overlapping, the writer would wait for ever.`
            : v === 'mutex'
              ? 'No: m hands itself to the threads in the order they asked, so a reader who comes after the writer waits behind it. But readers cannot share the room either.'
              : 'No: the writer holds the turnstile while it waits, so every reader who comes later stops at the turnstile until the writer is done.',
          watch: [['every']],
        };
      },
    },
  ];
}
