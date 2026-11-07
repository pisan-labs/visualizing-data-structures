import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { MAX_I, PART_NAMES, illegal, pieces, pump } from './game';
import { LANGUAGES, MAX_S, lang, show, type Language, type Lemma } from './languages';
import {
  COND,
  defaults,
  pumpedName,
  splitText,
  type PumpExtra,
  type PumpSettings,
  type PumpState,
} from './model';

type Def = VizDef<PumpState, PumpSettings, PumpExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** A string in L, at least p long and at most `most`, from the language's own sampler. */
function stringIn(rng: Rng, l: Language, p: number, most: number): string {
  for (let tries = 0; tries < 30; tries++) {
    const w = l.sample(rng, rng.int(p, most));
    if (w.length >= p && w.length <= Math.min(most + 4, MAX_S) && l.member(w)) return w;
  }
  return l.prover(p, 'regular');
}

const asSplit = (s: string, parts: number[]) =>
  pieces(s, parts)
    .map((w) => w || 'ε')
    .join('|');

/**
 * Practice for the pumping game. Every answer comes from running the model: legality from the
 * Split operation's own check, the winning i from playing each i, and the counts from the
 * adversary's search in the String operation.
 */
export function pumpingPractice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[], settings: PumpSettings) => new Timeline(def(), settings, 1, calls);

  return [
    {
      id: 'legal-split',
      title: 'Is the split legal?',
      make(rng) {
        const lemma: Lemma = rng.int(0, 2) === 0 ? 'cf' : 'regular';
        const settings: PumpSettings = { ...defaults, role: 'defend', lemma, p: rng.int(3, 4) };
        const l = pick(
          rng,
          LANGUAGES.filter((x) => x.prover(settings.p, lemma).length <= 12),
        );
        const setup: OpCall[] = [['language', l.key]];
        const s = run(setup, settings).endState().s!;
        const n = s.length;
        const p = settings.p;
        const want = rng.int(0, 2);
        let parts: number[];
        if (lemma === 'regular') {
          const y = want === 2 ? 0 : rng.int(1, p);
          const x = want === 1 ? rng.int(Math.max(0, p + 1 - y), n - Math.max(y, 1)) : rng.int(0, p - Math.max(y, 1));
          parts = [x, y, n - x - y];
        } else {
          const v = want === 2 ? 0 : rng.int(0, 1);
          const y = want === 2 ? 0 : rng.int(v ? 0 : 1, 2);
          const x =
            want === 1
              ? rng.int(p + 1 - v - y, Math.min(p + 1, n - v - y))
              : rng.int(0, p - v - y);
          const u = rng.int(0, n - v - x - y);
          parts = [u, v, x, y, n - u - v - x - y];
        }
        const typed = asSplit(s, parts);
        const t = run([...setup, ['split', typed]], settings);
        const legal = t.endState().parts !== null;
        const why = illegal(n, parts, p, lemma);
        const names = PART_NAMES[lemma];
        const options =
          lemma === 'regular'
            ? ['Legal', 'Not legal: |xy| > p', 'Not legal: y is empty']
            : ['Legal', 'Not legal: |vxy| > p', 'Not legal: v and y are both empty'];
        const correct = legal ? 0 : why && /empty/.test(why) ? 2 : 1;
        return {
          prompt: `You are the adversary, with p = ${p}, and the page picked s = ${show(s)}. Is the split ${splitText(s, parts, lemma)} legal? A legal split has ${COND[lemma]}.`,
          setup,
          settings,
          answer: { kind: 'choice', options, correct },
          explain: legal
            ? `It is legal: the pieces spell s, and ${COND[lemma].replace('p', String(p))}. Type it as ${typed} and press Split to see what the page does with it.`
            : `It is not legal: ${why}. The split ${names.join('|')} is the adversary’s choice, but only within the rules.`,
          watch: [['split', typed]],
        };
      },
    },
    {
      id: 'which-i',
      title: 'Which i wins?',
      make(rng) {
        for (;;) {
          const settings: PumpSettings = { ...defaults, p: rng.int(2, 4) };
          const l = pick(
            rng,
            LANGUAGES.filter((x) => x.level !== 'regular'),
          );
          const s = rng.int(0, 1) ? l.prover(settings.p, 'regular') : stringIn(rng, l, settings.p, 10);
          const setup: OpCall[] = [
            ['language', l.key],
            ['string', s],
          ];
          const end = run(setup, settings).endState();
          if (!end.parts || end.s === null) continue;
          let win = -1;
          for (let i = 0; i <= MAX_I && win < 0; i++)
            if (run([...setup, ['pump', i]], settings).endState().winner === 'you') win = i;
          if (win < 0) continue;
          const pumped = pump(end.s, end.parts, win, 'regular');
          return {
            prompt: `L = ${l.set}, p = ${settings.p} and s = ${show(end.s)}. The adversary split s as ${splitText(end.s, end.parts, 'regular')}. What is the smallest i from 0 to ${MAX_I} that pumps s out of L?`,
            setup,
            settings,
            answer: { kind: 'number', value: win },
            explain: `${pumpedName(win, 'regular')} = ${show(pumped)} is not in L: ${l.why(pumped)}.${win > 0 ? ' Every smaller i keeps it in L.' : ''}`,
            watch: [['pump', win]],
          };
        }
      },
    },
    {
      id: 'count-splits',
      title: 'How many splits?',
      make(rng) {
        const settings: PumpSettings = { ...defaults, p: rng.int(2, 5) };
        const l = pick(rng, LANGUAGES);
        const s = stringIn(rng, l, settings.p, 12);
        const setup: OpCall[] = [['language', l.key]];
        const end = run([...setup, ['string', s]], settings).endState();
        const count = end.search?.splits ?? 0;
        const p = settings.p;
        return {
          prompt: `L = ${l.set} and the adversary picked p = ${p}. You pick s = ${show(s)}, which is ${s.length} symbols long. How many legal splits s = xyz with |xy| ≤ p and |y| ≥ 1 does the adversary have to choose from?`,
          setup,
          settings,
          answer: { kind: 'number', value: count },
          explain: `x and y lie in the first ${p} symbols. With |xy| = k, x can be 0 to k − 1 symbols long, so there are k splits; k runs from 1 to ${p}, so 1 + 2 + … + ${p} = ${count}. The rest of s does not matter: that is why aᵖ… strings are so easy to reason about.`,
          watch: [['string', s]],
        };
      },
    },
    {
      id: 'beats-every-split',
      title: 'Does s beat every split?',
      make(rng) {
        const settings: PumpSettings = { ...defaults, p: rng.int(2, 4) };
        const l = pick(rng, LANGUAGES);
        const s = rng.int(0, 2) === 0 ? l.prover(settings.p, 'regular') : stringIn(rng, l, settings.p, 10);
        const setup: OpCall[] = [['language', l.key]];
        const end = run([...setup, ['string', s]], settings).endState();
        const k = end.search?.survivors ?? 0;
        const n = end.search?.splits ?? 0;
        const options = [
          'Yes: every split dies for some i',
          'No: some split survives every i',
        ];
        const split = end.parts ? splitText(end.s!, end.parts, 'regular') : '';
        return {
          prompt: `L = ${l.set} and p = ${settings.p}. You pick s = ${show(s)}. Does s beat every legal split, so that some i from 0 to ${MAX_I} pumps it out of L whatever the adversary does?`,
          setup,
          settings,
          answer: { kind: 'choice', options, correct: k === 0 ? 0 : 1 },
          explain:
            k === 0
              ? `Yes. All ${n} legal splits die for some i, so you win whatever split the adversary picks.`
              : `No. ${k} of the ${n} legal splits survive every i, for example ${split}. The adversary picks one of those and wins.${l.level === 'regular' ? ` L is regular, so every long enough string has one.` : ' L is not regular, but this s gives the adversary room.'}`,
          watch: [['string', s]],
        };
      },
    },
  ];
}
