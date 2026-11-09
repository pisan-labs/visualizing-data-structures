import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { defaults, type HashExtra, type HashSettings, type HashState } from './model';

type Def = VizDef<HashState, HashSettings, HashExtra>;

const WORDS = [
  'banana',
  'abracadabra',
  'mississippi',
  'cocoa',
  'papaya',
  'tartar',
  'hashing',
  'rolling',
];

function word(rng: Rng): string {
  return WORDS[rng.int(0, WORDS.length - 1)]!;
}

/**
 * Practice questions for string hashing. Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function hashPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: HashSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);
  const last = (t: Timeline<HashState, HashSettings, HashExtra>) => t.entries.at(-1)!.steps.at(-1)!;

  return [
    {
      id: 'prefix',
      title: 'A prefix hash',
      make(rng) {
        const s = word(rng).slice(0, rng.int(4, 6));
        const k = rng.int(2, Math.min(4, s.length));
        const end = run([['load', s], ['build']]).endState();
        const h = end.H[0]![k]!;
        return {
          prompt: `s = \`${s}\`, b = ${defaults.b}, p = ${defaults.p}, and a = 1, b = 2, …, z = 26. What is H[${k}], the hash of the first ${k} characters? Use H[k + 1] = (H[k]·b + s[k]) mod p, starting from H[0] = 0.`,
          setup: [['load', s]],
          answer: { kind: 'number', value: h },
          explain: `H[1..${k}] = ${end.H[0]!.slice(1, k + 1).join(', ')}: each step multiplies by ${defaults.b}, adds the next letter's value and keeps the remainder mod ${defaults.p}.`,
          watch: [['build']],
        };
      },
    },
    {
      id: 'substring',
      title: 'A substring in O(1)',
      make(rng) {
        const s = word(rng);
        const l = rng.int(0, s.length - 3);
        const r = rng.int(l + 1, Math.min(s.length - 1, l + 4));
        const t = run([['load', s], ['build'], ['hash', l, r]]);
        const h = Number(last(t).vars!.hash);
        const end = t.endState();
        const len = r - l + 1;
        return {
          prompt: `The table shows the prefix hashes H and the powers P = b^k mod p of \`${s}\`. What is hash(s[${l}..${r}]) = (H[${r + 1}] − H[${l}]·P[${len}]) mod ${defaults.p}?`,
          setup: [['load', s], ['build']],
          answer: { kind: 'number', value: h },
          explain: `(${end.H[0]![r + 1]} − ${end.H[0]![l]}·${end.P[0]![len]}) mod ${defaults.p} = ${h}, the same as hashing \`${s.slice(l, r + 1)}\` from scratch.`,
          watch: [['hash', l, r]],
        };
      },
    },
    {
      id: 'verdict',
      title: 'Equal, different or a collision?',
      make(rng) {
        const settings: HashSettings = { ...defaults, p: 13 };
        const s = word(rng);
        const len = rng.int(2, 3);
        const i = rng.int(0, s.length - len);
        let j = rng.int(0, s.length - len);
        if (j === i) j = (i + 1) % (s.length - len + 1);
        const t = run([['load', s], ['build'], ['compare', i, j, len]], settings);
        const result = String(last(t).vars!.result);
        const options = [
          'They are different',
          'They are equal',
          'A collision: same hash, different strings',
        ];
        const correct = result === 'different' ? 0 : result === 'equal' ? 1 : 2;
        const x = s.slice(i, i + len);
        const y = s.slice(j, j + len);
        return {
          prompt: `With p = 13, compare s[${i}..${i + len - 1}] and s[${j}..${j + len - 1}] of \`${s}\` by their hashes, then check the characters. What do you find?`,
          setup: [['load', s], ['build']],
          settings: settings as Settings,
          answer: { kind: 'choice', options, correct },
          explain:
            correct === 0
              ? `Their hashes differ, so \`${x}\` and \`${y}\` are different for certain.`
              : correct === 1
                ? `Same hash, and \`${x}\` = \`${y}\`.`
                : `\`${x}\` and \`${y}\` have the same hash mod 13 but are different strings: with only 13 hash values, collisions are common.`,
          watch: [['compare', i, j, len]],
        };
      },
    },
    {
      id: 'roll',
      title: 'Roll to the next window',
      make(rng) {
        const s = word(rng);
        const k = rng.int(2, 3);
        const w = rng.int(1, s.length - k);
        const end = run([
          ['load', s],
          ['windows', k],
        ]).endState();
        const before = end.win!.h[0]![w - 1]!;
        const after = end.win!.h[0]![w]!;
        const top = Math.pow(defaults.b, k - 1) % defaults.p;
        return {
          prompt: `s = \`${s}\`, b = ${defaults.b}, p = ${defaults.p}. The window \`${s.slice(w - 1, w - 1 + k)}\` hashes to ${before}, and b^${k - 1} mod p = ${top}. What does the next window, \`${s.slice(w, w + k)}\`, hash to? Use ((h − first·b^${k - 1})·b + next) mod p.`,
          setup: [['load', s]],
          answer: { kind: 'number', value: after },
          explain: `Drop \`${s[w - 1]}\`, shift by ${defaults.b} and add \`${s[w + k - 1]}\`: the next window hashes to ${after}.`,
          watch: [['windows', k]],
        };
      },
    },
  ];
}
