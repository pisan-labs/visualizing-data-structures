import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { ordered } from '../_recursion/kit';
import { gcd } from '../euclid/model';
import { defaults, type RsaSettings, type RsaState } from './model';

type Def = VizDef<RsaState, RsaSettings, undefined>;

const SMALL = [5, 7, 11, 13, 17, 19, 23];

/** Practice for RSA. Every answer comes from running the model. */
export function rsaPractice(def: () => Def): PracticeKind[] {
  const last = (calls: OpCall[]): Step<RsaState, undefined> => {
    const t = new Timeline(def(), defaults, 1, calls);
    return t.entries[t.entries.length - 1]!.steps.at(-1)!;
  };
  const pair = (rng: { int(a: number, b: number): number }) => {
    const p = SMALL[rng.int(0, SMALL.length - 1)]!;
    let q = p;
    while (q === p) q = SMALL[rng.int(0, SMALL.length - 1)]!;
    return [p, q] as const;
  };

  return [
    {
      id: 'phi',
      title: 'Compute φ(n)',
      make(rng) {
        const [p, q] = pair(rng);
        const k = last([['keys', p, q]]).state.keys!;
        return {
          prompt: `The picture shows keys made from 11 and 13. With p = ${p} and q = ${q}, what is φ(n)?`,
          setup: [['keys', 11, 13]],
          answer: { kind: 'number', value: k.phi! },
          explain: `φ(n) = (p − 1)(q − 1) = ${p - 1}·${q - 1} = ${k.phi}. (n itself is ${k.n}.)`,
          watch: [['keys', p, q]],
        };
      },
    },
    {
      id: 'd',
      title: 'Find d',
      make(rng) {
        const [p, q] = pair(rng);
        const phi = (p - 1) * (q - 1);
        const options = [3, 5, 7, 11, 13, 17].filter((e) => e < phi && gcd(e, phi) === 1);
        const e = options[rng.int(0, options.length - 1)]!;
        const k = last([
          ['keys', p, q],
          ['useE', e],
        ]).state.keys!;
        return {
          prompt: `p = ${p}, q = ${q}, so φ(n) = ${phi}, and e = ${e}. What is d, from 1 to ${phi - 1}?`,
          setup: [['keys', p, q]],
          answer: { kind: 'number', value: k.d! },
          explain: `d is the inverse of ${e} mod ${phi}: ${e}·${k.d} = ${e * k.d!} = ${Math.floor((e * k.d!) / phi)}·${phi} + 1. Extended Euclid on (${phi}, ${e}) finds it.`,
          watch: [['useE', e]],
        };
      },
    },
    {
      id: 'encrypt',
      title: 'Encrypt a message',
      make(rng) {
        const [p, q] = pair(rng);
        const keys = last([['keys', p, q]]).state.keys!;
        const m = rng.int(2, Math.min(20, keys.n! - 1));
        const end = last([
          ['keys', p, q],
          ['encrypt', m],
        ]).state;
        return {
          prompt: `The public key is (e, n) = (${keys.e}, ${keys.n}). What is the ciphertext for m = ${m}?`,
          setup: [['keys', p, q]],
          answer: { kind: 'number', value: end.c! },
          explain: `c = m^e mod n = ${m}^${keys.e} mod ${keys.n} = ${end.c}. Square-and-multiply keeps every number below n².`,
          watch: [['encrypt', m]],
        };
      },
    },
    {
      id: 'valid-e',
      title: 'Can e be used?',
      make(rng) {
        const [p, q] = pair(rng);
        const phi = (p - 1) * (q - 1);
        const e = rng.int(3, Math.min(phi - 1, 25));
        const after = last([
          ['keys', p, q],
          ['useE', e],
        ]).state.keys!;
        const ok = after.e === e;
        const g = gcd(e, phi);
        return {
          prompt: `p = ${p} and q = ${q}, so φ(n) = ${phi}. Can e = ${e} be used?`,
          setup: [['keys', p, q]],
          answer: ordered(['Yes', 'No'], ok ? 'Yes' : 'No'),
          explain: ok
            ? `gcd(${e}, ${phi}) = 1, so ${e} has an inverse mod ${phi}: d = ${after.d}.`
            : `gcd(${e}, ${phi}) = ${g}, so ${e} has no inverse mod ${phi}, and nothing could decrypt.`,
          watch: [['useE', e]],
        };
      },
    },
  ];
}
