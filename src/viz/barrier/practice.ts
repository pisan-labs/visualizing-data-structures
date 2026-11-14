import type { PracticeKind } from '../../engine/types';
import { scheduleText } from '../_threads2/page';
import { mrun, rowNow } from '../_threads3/macro';
import { randomRows } from '../_threads3/page';
import { kinds, macro, seated, type BarrierSettings } from './model';

const T = (t: number) => `T${t + 1}`;
const digits = (sched: number[]) => sched.map((t) => t + 1).join('');

const barrierText =
  'Three threads meet at a barrier: each adds 1 to count (holding a lock), the third to arrive calls V(b), and each then passes the turnstile, P(b) then V(b), and goes on. b starts at 0.';
const reusableText =
  'Three threads go round twice through a reusable barrier: each adds 1 to count (the third to arrive opens b1 three times), passes P(b1), goes on, takes 1 from count (the last to leave opens b2 three times) and passes P(b2).';
const carText =
  'A car leaves with one driver D and two riders. D calls V(seat) twice, P(in) twice and V(go) twice, then goes; each rider R1, R2, R3 calls P(seat), V(in) and P(go), then goes. All three semaphores start at 0.';

/** Practice for barriers. Every answer comes from running the thread machine. */
export function barrierPractice(): PracticeKind[] {
  return [
    {
      id: 'first',
      title: 'Who passes the barrier first?',
      make(rng) {
        const settings: BarrierSettings = { problem: 'barrier', naive: false };
        const mac = macro(settings);
        const sched = randomRows(rng, mac, 200);
        const run = mrun(mac, sched);
        const pAt = kinds(settings, 0).indexOf('P');
        // Replay: the first thread whose row moves past P(b).
        let s = mrun(mac, []).state;
        let first = -1;
        let at = 0;
        for (const [i, st] of run.steps.entries()) {
          s = mrun(mac, [st.thread], s).state;
          const past = [0, 1, 2].find((t) => rowNow(mac, s, t) > pAt);
          if (past !== undefined) {
            first = past;
            at = i + 1;
            break;
          }
        }
        const last = [0, 1, 2].find((t) => s.threads[t]!.regs.r === 3);
        const options = ['T1', 'T2', 'T3'];
        return {
          prompt: `${barrierText} Run the schedule \`${scheduleText(sched)}\`: each number is the thread that takes the next step. Which thread gets past P(b) first?`,
          setup: [],
          settings,
          answer: { kind: 'choice', options, correct: first },
          explain: `${T(first)}, at step ${at}. ${last === undefined ? '' : `${T(last)} was the third to arrive, so it opened the turnstile; `}${last === first ? 'nobody was waiting yet, so it walked through itself.' : `${T(first)} was the first waiting at P(b), so it went through first.`}`,
          watch: [['run', digits(sched)]],
        };
      },
    },
    {
      id: 'count',
      title: 'What is count after these steps?',
      make(rng) {
        const reusable = rng.int(0, 2) === 0;
        const settings: BarrierSettings = {
          problem: reusable ? 'reusable' : 'barrier',
          naive: false,
        };
        const mac = macro(settings);
        const sched = randomRows(rng, mac, rng.int(3, reusable ? 18 : 10));
        const s = mrun(mac, sched).state;
        const c = s.mem.count ?? 0;
        return {
          prompt: `${reusable ? reusableText : barrierText} Run the schedule \`${scheduleText(sched)}\` from the start. What is count after it?`,
          setup: [],
          settings,
          answer: { kind: 'number', value: c },
          explain: reusable
            ? `${c}: each arrival adds 1 and each departure past the first turnstile takes 1 away, so count is how many are between arriving and leaving.`
            : `${c}: each thread adds 1 when it arrives, and nothing takes it away.`,
          watch: [['run', digits(sched)]],
        };
      },
    },
    {
      id: 'car',
      title: 'Which riders leave together?',
      make(rng) {
        const settings: BarrierSettings = { problem: 'group', naive: false };
        const mac = macro(settings);
        const sched = randomRows(rng, mac, 200);
        const s = mrun(mac, sched).state;
        const riders = seated(mac, s).map((t) => mac.p.threads[t]!.name);
        const left = ['R1', 'R2', 'R3'].find((r) => !riders.includes(r))!;
        return {
          prompt: `${carText} Run the schedule \`${scheduleText(sched)}\` from the start (lane 1 is D, then R1, R2, R3). Which two riders leave with D? Type them, lowest number first.`,
          setup: [],
          settings,
          answer: { kind: 'sequence', value: riders },
          explain: `${riders.join(' and ')}: they got the two seats D opened. ${left} came to P(seat) after both seats were taken, so it waits for the next car.`,
          watch: [['run', digits(sched)]],
        };
      },
    },
  ];
}
