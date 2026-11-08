import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { randomWord } from '../_strings/kit';
import { choice, shuffle } from '../_strings/practice';
import {
  defaults,
  tripleText,
  type LzExtra,
  type LzSettings,
  type LzState,
  type Triple,
} from './model';

type Def = VizDef<LzState, LzSettings, LzExtra>;

/** A text with repeats, so LZ finds matches. */
function text(rng: Rng, n: number): string {
  const base = randomWord(rng, rng.int(2, 3), 'abc');
  let t = '';
  while (t.length < n) t += rng.int(0, 3) ? base : randomWord(rng, 1, 'abc');
  return t.slice(0, n);
}

/**
 * Practice questions for LZ77 and LZW. Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function lzPractice(def: () => Def): PracticeKind[] {
  const lzwSet: LzSettings = { ...defaults, method: 'lzw' };
  const run = (ops: OpCall[], s: LzSettings = defaults) => new Timeline(def(), s, 1, ops);
  const encoded = (t: string, s: LzSettings = defaults) =>
    run([['load', t], ['encode']], s).endState();

  return [
    {
      id: 'lz77-triple',
      title: 'The next LZ77 triple',
      make(rng) {
        for (let tries = 0; tries < 200; tries++) {
          const t = text(rng, rng.int(8, 12));
          const ts = encoded(t).triples;
          const ks = ts.map((x, k) => (x.len > 0 ? k : -1)).filter((k) => k >= 0);
          if (!ks.length) continue;
          const k = ks[rng.int(0, ks.length - 1)]!;
          const x = ts[k]!;
          const right = tripleText(x);
          const alt = (d: Partial<Triple>) => tripleText({ ...x, ...d });
          return {
            prompt: `LZ77 (window ${defaults.window}, lookahead ${defaults.lookahead}) has encoded the first ${x.at} characters of \`${t}\`. Which triple does it write next? Ties go to the nearest match.`,
            settings: { ...defaults },
            setup: [['load', t]],
            answer: choice(rng, right, [
              alt({ off: x.off + 1 }),
              alt({ len: x.len - 1, next: t[x.at + x.len - 1]! }),
              alt({ off: 0, len: 0, next: t[x.at]! }),
              alt({ off: Math.max(1, x.off - 1) }),
            ]),
            explain: `At position ${x.at} the longest match in the window is \`${t.slice(x.at, x.at + x.len)}\`, ${x.off} back, followed by \`${x.next}\`: ${right}.`,
            watch: [['encode']],
          };
        }
        throw new Error('No text with a match turned up.');
      },
    },
    {
      id: 'lz77-decode',
      title: 'Decode the triples',
      make(rng) {
        const t = text(rng, rng.int(7, 10));
        const st = encoded(t);
        const list = st.triples.map(tripleText).join(' ');
        const back = run([['load', t], ['encode'], ['decode']]).endState().out;
        return {
          prompt: `Decode these LZ77 triples: ${list}.`,
          settings: { ...defaults },
          setup: [['load', t], ['encode']],
          answer: choice(rng, back, [
            st.triples.map((x) => x.next).join(''),
            back.slice(0, -1) + (back.endsWith('a') ? 'b' : 'a'),
            [...back].reverse().join(''),
            shuffle(rng, [...back]).join(''),
          ]),
          explain: `Copy each triple's characters from offset back, one at a time, then add its next character: \`${back}\`.`,
          watch: [['decode']],
        };
      },
    },
    {
      id: 'lzw-codes',
      title: 'How many LZW codes?',
      make(rng) {
        const t = text(rng, rng.int(6, 10));
        const st = encoded(t, lzwSet);
        return {
          prompt: `LZW starts with every single byte (a = 97, b = 98, c = 99) and adds a code from 256 up each time it writes one. How many codes does it write for \`${t}\`?`,
          settings: { ...lzwSet },
          setup: [['load', t]],
          answer: { kind: 'number', value: st.codes.length },
          explain: `The codes are ${st.codes.map((c) => `${c.code} (${c.str})`).join(', ')}: ${st.codes.length} in all.`,
          watch: [['encode']],
        };
      },
    },
    {
      id: 'lzw-entry',
      title: 'Which string gets the code?',
      make(rng) {
        const t = text(rng, rng.int(7, 10));
        const st = encoded(t, lzwSet);
        const d = st.dict[rng.int(0, st.dict.length - 1)]!;
        const others = st.dict.filter((x) => x.str !== d.str).map((x) => x.str);
        return {
          prompt: `LZW encodes \`${t}\`, starting with every single byte and numbering new strings from 256. Which string becomes code ${d.code}?`,
          settings: { ...lzwSet },
          setup: [['load', t]],
          answer: choice(rng, d.str, [...shuffle(rng, others), d.str.slice(0, -1) || 'ab', d.str + 'a']),
          explain: `Code ${d.code} is \`${d.str}\`: LZW learned it when it wrote the code for \`${d.str.slice(0, -1)}\` and \`${d.str.slice(-1)}\` came next.`,
          watch: [['encode']],
        };
      },
    },
  ];
}
