import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { lzCompression } from '.';
import { MAX_TEXT, defaults, tripleText, type LzSettings } from './model';

const run = (ops: OpCall[], s: LzSettings = defaults) => new Timeline(lzCompression, s, 1, ops);

/** A plain LZ77 decoder. */
function unlz77(ts: { off: number; len: number; next: string }[]): string {
  let out = '';
  for (const t of ts) {
    for (let i = 0; i < t.len; i++) out += out[out.length - t.off];
    out += t.next;
  }
  return out;
}

/** A plain LZW decoder over the 256 bytes. */
function unlzw(codes: number[]): string {
  const dict = new Map<number, string>();
  for (let b = 0; b < 256; b++) dict.set(b, String.fromCharCode(b));
  let prev: string | null = null;
  let out = '';
  for (const c of codes) {
    const cur: string = dict.get(c) ?? prev! + prev![0];
    if (prev !== null) dict.set(dict.size, prev + cur[0]);
    out += cur;
    prev = cur;
  }
  return out;
}

/** A plain greedy LZ77 encoder: longest match, nearest on ties, a next character always left. */
function refLz77(text: string, w: number, a: number) {
  const out: { off: number; len: number; next: string; at: number }[] = [];
  for (let pos = 0; pos < text.length;) {
    let off = 0;
    let len = 0;
    for (let d = 1; d <= Math.min(w, pos); d++) {
      let k = 0;
      while (k < Math.min(a, text.length - pos - 1) && text[pos - d + k] === text[pos + k]) k++;
      if (k > len) [off, len] = [d, k];
    }
    out.push({ off, len, next: text[pos + len]!, at: pos });
    pos += len + 1;
  }
  return out;
}

const textArb = fc.string({
  unit: fc.constantFrom('a', 'b', 'c'),
  minLength: 1,
  maxLength: MAX_TEXT,
});
const settingsArb = fc.record({
  method: fc.constantFrom('lz77' as const, 'lzw' as const),
  window: fc.integer({ min: 1, max: 16 }),
  lookahead: fc.integer({ min: 1, max: 12 }),
});

describe('LZ77 and LZW', { timeout: 60_000 }, () => {
  it('encodes so a plain decoder gets the text back, and decodes it back itself', () => {
    fc.assert(
      fc.property(textArb, settingsArb, (text, s) => {
        const t = run([['load', text], ['encode'], ['decode']], s);
        const enc = t.entries[1]!.end;
        if (s.method === 'lz77') {
          expect(unlz77(enc.triples)).toBe(text);
          expect(enc.triples).toEqual(refLz77(text, s.window, s.lookahead));
          for (const x of enc.triples) {
            expect(x.off).toBeLessThanOrEqual(s.window);
            expect(x.len).toBeLessThanOrEqual(s.lookahead);
            if (x.len) expect(x.off).toBeGreaterThan(0);
          }
          // Greedy: no start in the window matches longer.
          for (const x of enc.triples) {
            const max = Math.min(s.lookahead, text.length - x.at - 1);
            for (let d = 1; d <= Math.min(s.window, x.at); d++) {
              let k = 0;
              while (k < max && text[x.at - d + k] === text[x.at + k]) k++;
              expect(k).toBeLessThanOrEqual(x.len);
            }
          }
        } else {
          expect(unlzw(enc.codes.map((c) => c.code))).toBe(text);
          expect(enc.dict.length).toBe(Math.max(0, enc.codes.length - 1));
        }
        // Decoding writes a prefix of the text on every step.
        for (const step of t.entries[2]!.steps) expect(text.startsWith(step.state.out)).toBe(true);
        expect(t.endState().out).toBe(text);
      }),
      { numRuns: 300 },
    );
  });

  it('writes (1,6,a) for a run and reports the ratio', () => {
    const t = run([['load', 'aaaaaaaaab'], ['encode']]);
    expect(t.endState().triples.map(tripleText)).toEqual(['(0,0,a)', '(1,6,a)', '(1,1,b)']);
    expect(t.entries[1]!.steps.at(-1)!.vars!.ratio).toBe(`${Math.round((100 * 3 * 15) / 80)}%`);
  });

  it('does not call the last character a mismatch when only it is left', () => {
    // aa: at position 1 the a in the window does match, but no room is left for a match.
    const steps = run([['load', 'aa'], ['encode']]).entries[1]!.steps;
    expect(steps.some((s) => /does not match/.test(s.say))).toBe(false);
    expect(steps.some((s) => /Nothing in the window/.test(s.say))).toBe(false);
    expect(steps.some((s) => /Only T\[1\] = 'a' is left/.test(s.say))).toBe(true);
  });

  it('decodes without an encode first and explains bad input', () => {
    const t = run([['load', 'abab'], ['decode'], ['load', 'a b'], ['load', 'x'.repeat(21)]]);
    expect(t.entries[1]!.end.out).toBe('abab');
    expect(t.entries[2]!.steps[0]!.say).toMatch(/no spaces/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/21 characters/);
  });

  it('meets the tricky LZW case', () => {
    const t = run([['load', 'abababababab'], ['encode'], ['decode']], {
      ...defaults,
      method: 'lzw',
    });
    expect(t.entries[2]!.steps.some((s) => s.lines.includes('d.tricky'))).toBe(true);
  });
});

describe('LZ practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 400; seed++)
      for (const item of practiceSet(lzCompression, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(15);
    return out;
  }
  const text = (q: PracticeQuestion) => String(q.setup[0]![1]);
  const picked = (q: PracticeQuestion) =>
    q.answer.kind === 'choice' ? q.answer.options[q.answer.correct] : undefined;

  it('decodes to the text and counts codes a plain decoder agrees with', () => {
    for (const q of questions('lz77-decode')) expect(picked(q)).toBe(text(q));
    for (const q of questions('lzw-codes')) {
      const end = run([['load', text(q)], ['encode']], { ...defaults, method: 'lzw' }).endState();
      expect(unlzw(end.codes.map((c) => c.code))).toBe(text(q));
      expect(q.answer).toEqual({ kind: 'number', value: end.codes.length });
    }
    for (const q of questions('lz77-triple')) {
      const at = Number(/first (\d+) characters/.exec(q.prompt)![1]);
      const t = refLz77(text(q), 8, 6).find((x) => x.at === at)!;
      expect(picked(q)).toBe(`(${t.off},${t.len},${t.next})`);
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(lzCompression, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(lzCompression, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
