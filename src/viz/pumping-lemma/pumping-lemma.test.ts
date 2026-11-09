import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, StageSize } from '../../engine/types';
import type { Shape } from '../../render/scene';
import { pumpingLemma as def, gameCalls, parseInput, splitInput } from '.';
import { MAX_I, PROVER_TRIES, readSplit, splits } from './game';
import { LANGUAGES, MAX_S, findLanguage, inClass, type LangId, type Lemma } from './languages';
import { defaults, type PumpExtra, type PumpSettings, type PumpState } from './model';
import { TYPICAL_STAGES } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

// ---------------------------------------------------------------------------------------------
// Reference: membership, splits and pumping written from the definitions, apart from the model.

function refMember(id: LangId, w: string): boolean {
  const n = w.length;
  const as = (k: number) => 'a'.repeat(k);
  switch (id) {
    case 'anbn':
      return n % 2 === 0 && w === as(n / 2) + 'b'.repeat(n / 2);
    case 'paren': {
      // Remove "()" until nothing changes.
      let t = w;
      for (let prev = ''; prev !== t;) [prev, t] = [t, t.replaceAll('()', '')];
      return t === '';
    }
    case 'wwr':
      return n % 2 === 0 && [...w].every((c, i) => c === w[n - 1 - i]);
    case 'ww':
      return n % 2 === 0 && w.slice(0, n / 2) === w.slice(n / 2);
    case 'anbncn':
      return n % 3 === 0 && w === as(n / 3) + 'b'.repeat(n / 3) + 'c'.repeat(n / 3);
    case 'squares':
      return w === as(n) && Array.from({ length: n + 1 }, (_, k) => k * k).includes(n);
    case 'primes':
      return (
        w === as(n) && n >= 2 && Array.from({ length: n - 2 }, (_, k) => k + 2).every((d) => n % d)
      );
    case 'abstar':
      return n % 2 === 0 && w === 'ab'.repeat(n / 2);
    case 'astarbstar':
      return !w.includes('ba') && /^[ab]*$/.test(w);
  }
}

/** Every split of s into 3 or 5 pieces that the lemma allows, by brute force. */
function refSplits(n: number, p: number, lemma: Lemma): number[][] {
  const out: number[][] = [];
  if (lemma === 'regular') {
    for (let a = 0; a <= n; a++)
      for (let b = a; b <= n; b++) if (b <= p && b - a >= 1) out.push([a, b - a, n - b]);
    return out;
  }
  for (let a = 0; a <= n; a++)
    for (let b = a; b <= n; b++)
      for (let c = b; c <= n; c++)
        for (let d = c; d <= n; d++)
          if (d - a <= p && b - a + (d - c) >= 1) out.push([a, b - a, c - b, d - c, n - d]);
  return out;
}

function refPump(s: string, parts: number[], i: number, lemma: Lemma): string {
  const cut: string[] = [];
  let at = 0;
  for (const k of parts) {
    cut.push(s.slice(at, at + k));
    at += k;
  }
  if (lemma === 'regular') return cut[0]! + cut[1]!.repeat(i) + cut[2]!;
  return cut[0]! + cut[1]!.repeat(i) + cut[2]! + cut[3]!.repeat(i) + cut[4]!;
}

const legal = (parts: number[], n: number, p: number, lemma: Lemma) =>
  refSplits(n, p, lemma).some((q) => q.join() === parts.join());

const survives = (id: LangId, s: string, parts: number[], lemma: Lemma) =>
  Array.from({ length: MAX_I + 1 }, (_, i) => refMember(id, refPump(s, parts, i, lemma))).every(
    Boolean,
  );

const ALPHABET: Record<LangId, string[]> = {
  anbn: ['a', 'b'],
  paren: ['(', ')'],
  wwr: ['a', 'b'],
  ww: ['a', 'b'],
  anbncn: ['a', 'b', 'c'],
  squares: ['a'],
  primes: ['a'],
  abstar: ['a', 'b'],
  astarbstar: ['a', 'b'],
};

function allWords(symbols: string[], n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => symbols.map((c) => w + c));
    out.push(...level);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Invariants on every step

const STAGES: (StageSize | undefined)[] = [undefined, ...TYPICAL_STAGES];

function checkSteps(t: Timeline<PumpState, PumpSettings, PumpExtra>) {
  const { settings } = t;
  for (let k = 0; k < t.length; k++) {
    const { step } = t.at(k);
    const st = step.state;
    const l = LANGUAGES.find((x) => x.id === st.lang)!;
    expect(st.p).toBe(settings.p);
    expect(step.vars?.p).toBe(settings.p);
    if (st.s !== null) {
      expect(refMember(st.lang, st.s), `s = ${st.s} is in L`).toBe(true);
      expect(st.s.length).toBeGreaterThanOrEqual(st.p);
      expect(st.s.length).toBeLessThanOrEqual(MAX_S);
      expect([...st.s].every((c) => l.alphabet.includes(c))).toBe(true);
    }
    if (st.parts) {
      expect(st.s).not.toBeNull();
      expect(legal(st.parts, st.s!.length, st.p, settings.lemma), `split ${st.parts}`).toBe(true);
      st.tried.forEach((r, i) => {
        if (r !== null)
          expect(r).toBe(refMember(st.lang, refPump(st.s!, st.parts!, i, settings.lemma)));
      });
      expect(st.tried[1]).toBe(true);
    } else expect(st.tried.every((r) => r === null)).toBe(true);
    if (st.winner) expect(st.i).not.toBeNull();
    const look = step.extra?.look;
    if (look) {
      expect(legal(look.parts, st.s!.length, st.p, settings.lemma)).toBe(true);
      look.results.forEach((r, i) =>
        expect(r).toBe(refMember(st.lang, refPump(st.s!, look.parts, i, settings.lemma))),
      );
    }
    for (const stage of STAGES) {
      const scene = def.view(step, settings, stage);
      const b = scene.bounds;
      for (const s of scene.shapes as Shape[]) {
        if (s.kind !== 'text') continue;
        // Text, measured wide (CI's font), stays inside the frame.
        const w = [...s.text].length * (s.size ?? 16) * 0.6;
        const left = s.anchor === 'middle' ? s.x - w / 2 : s.anchor === 'end' ? s.x - w : s.x;
        expect(left, `${s.id} "${s.text}"`).toBeGreaterThanOrEqual(b.x);
        expect(left + w, `${s.id} "${s.text}"`).toBeLessThanOrEqual(b.x + b.w);
      }
    }
  }
}

const settingsArb = fc.record({
  lemma: fc.constantFrom<Lemma>('regular', 'cf'),
  p: fc.integer({ min: 2, max: 5 }),
});

/** A language and a string in it, at least p long and at most MAX_S. */
const gameArb = fc
  .record({
    s: settingsArb,
    id: fc.constantFrom(...LANGUAGES.map((l) => l.id)),
    seed: fc.integer({ min: 1, max: 1e6 }),
    n: fc.integer({ min: 0, max: 16 }),
    i: fc.integer({ min: 0, max: MAX_I }),
  })
  .map(({ s, id, seed, n, i }) => {
    const l = LANGUAGES.find((x) => x.id === id)!;
    const w = l.sample(makeRng(seed), Math.max(n, s.p));
    return { settings: { ...defaults, ...s } as PumpSettings, id, w, i };
  })
  .filter(({ w, settings, id }) => w.length >= settings.p && w.length <= MAX_S && refMember(id, w));

// ---------------------------------------------------------------------------------------------

describe('pumping-lemma languages', () => {
  it('membership matches the definitions on every short word', () => {
    for (const l of LANGUAGES)
      for (const w of allWords(ALPHABET[l.id], 9))
        expect(l.member(w), `${l.id} ${w}`).toBe(refMember(l.id, w));
  });

  it('every sample and every prover string is in L, long enough, and fits', () => {
    for (const l of LANGUAGES)
      for (let p = 2; p <= 5; p++)
        for (const lemma of ['regular', 'cf'] as Lemma[]) {
          const s = l.prover(p, lemma);
          expect(refMember(l.id, s), `${l.id} ${s}`).toBe(true);
          expect(s.length).toBeGreaterThanOrEqual(p);
          expect(s.length).toBeLessThanOrEqual(MAX_S);
          for (let n = p; n <= 16; n++) {
            const w = l.sample(makeRng(n), n);
            expect(refMember(l.id, w), `${l.id} sample ${w}`).toBe(true);
            expect(w.length).toBeGreaterThanOrEqual(n);
          }
        }
  });

  it('the prover string beats every split exactly when L is outside the lemma’s class', () => {
    for (const l of LANGUAGES)
      for (let p = 2; p <= 5; p++)
        for (const lemma of ['regular', 'cf'] as Lemma[]) {
          const s = l.prover(p, lemma);
          const alive = refSplits(s.length, p, lemma).filter((q) => survives(l.id, s, q, lemma));
          expect(alive.length === 0, `${l.id} p=${p} ${lemma}`).toBe(!inClass(l, lemma));
        }
  });

  it('finds languages by key, name and alias, and never takes a string for one', () => {
    for (const l of LANGUAGES) {
      expect(findLanguage(l.key)).toBe(l);
      expect(findLanguage(l.name)).toBe(l);
      for (const a of l.aliases) {
        expect(findLanguage(a)).toBe(l);
        expect(/^[abc()]+$/.test(a), a).toBe(false);
      }
    }
  });
});

describe('pumping-lemma splits', () => {
  it('lists exactly the legal splits, once each', () => {
    for (let n = 1; n <= 12; n++)
      for (let p = 1; p <= 5; p++)
        for (const lemma of ['regular', 'cf'] as Lemma[]) {
          const got = splits(n, p, lemma).map((q) => q.join());
          expect(new Set(got).size).toBe(got.length);
          expect([...got].sort()).toEqual(
            refSplits(n, p, lemma)
              .map((q) => q.join())
              .sort(),
          );
        }
  });

  it('reads a split typed with bars or as lengths', () => {
    expect(readSplit('aa|a|abbbbb', 'aaaabbbbb', 'regular')).toEqual([2, 1, 6]);
    expect(readSplit('ε|a|aaabbbbb', 'aaaabbbbb', 'regular')).toEqual([0, 1, 8]);
    expect(readSplit('2 1', 'aaaabbbbb', 'regular')).toEqual([2, 1, 6]);
    expect(readSplit('a|a|eps|b|bb', 'aabbb', 'cf')).toEqual([1, 1, 0, 1, 2]);
    expect(typeof readSplit('a|a|b', 'aabbb', 'regular')).toBe('string');
    expect(typeof readSplit('9 9', 'aabb', 'regular')).toBe('string');
  });

  it('the input box takes languages, strings, splits and numbers, and nothing else', () => {
    expect(parseInput('anbn')).toBe('anbn');
    expect(parseInput('aaabbb')).toBe('aaabbb');
    expect(parseInput('a|a|bb')).toBe('a|a|bb');
    expect(parseInput('3')).toBe(3);
    expect(parseInput('((()))')).toBe('((()))');
    expect(parseInput('xyz')).toBeInstanceOf(Error);
    expect(parseInput('')).toBeInstanceOf(Error);
  });
});

describe('pumping-lemma game', () => {
  it('the adversary’s split is legal, the count is right, and the verdict matches membership', () => {
    fc.assert(
      fc.property(gameArb, ({ settings, id, w, i }) => {
        const l = LANGUAGES.find((x) => x.id === id)!;
        const t = new Timeline(def, settings, 1, [
          ['language', l.key],
          ['string', w],
          ['pump', i],
        ]);
        checkSteps(t);
        const [, played, pumped] = t.entries;
        const st = played!.end;
        const { lemma, p } = settings;
        const all = refSplits(w.length, p, lemma);
        const alive = all.filter((q) => survives(id, w, q, lemma));
        expect(st.s).toBe(w);
        expect(legal(st.parts!, w.length, p, lemma)).toBe(true);
        expect(st.search).toEqual({ splits: all.length, survivors: alive.length });
        // It keeps a split that survives every i whenever one exists.
        expect(survives(id, w, st.parts!, lemma)).toBe(alive.length > 0);
        // In the lemma's class, the adversary always has one.
        if (inClass(l, lemma)) expect(alive.length).toBeGreaterThan(0);
        const end = pumped!.end;
        const out = !refMember(id, refPump(w, st.parts!, i, lemma));
        expect(end.winner).toBe(out ? 'you' : 'page');
        expect(end.i).toBe(i);
      }),
      { numRuns: 300 },
    );
  });

  it('in the adversary’s role, the page picks the first i that wins, or none', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.constantFrom(...LANGUAGES.map((l) => l.id)),
        fc.nat(),
        (s, id, k) => {
          const settings: PumpSettings = { ...defaults, ...s, role: 'defend' };
          const l = LANGUAGES.find((x) => x.id === id)!;
          const page = l.prover(settings.p, settings.lemma);
          const all = refSplits(page.length, settings.p, settings.lemma);
          const parts = all[k % all.length]!;
          const t = new Timeline(def, settings, 1, [
            ['language', l.key],
            ['split', splitInput(page, parts)],
          ]);
          checkSteps(t);
          const end = t.endState();
          expect(end.s).toBe(page);
          expect(end.parts).toEqual(parts);
          const first = PROVER_TRIES.find(
            (i) => !refMember(id, refPump(page, parts, i, settings.lemma)),
          );
          if (first === undefined) {
            expect(end.winner).toBe('you');
            expect(inClass(l, settings.lemma)).toBe(true);
          } else {
            expect(end.winner).toBe('page');
            expect(end.i).toBe(first);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('refuses moves that break the rules and leaves the game as it was', () => {
    const settings = { ...defaults };
    const start: OpCall[] = [
      ['language', 'anbn'],
      ['string', 'aaaabbbb'],
    ];
    const before = new Timeline(def, settings, 1, start).endState();
    for (const bad of [
      ['string', 'ab'],
      ['string', 'aab'],
      ['string', 'xyz'],
      ['string', 'a'.repeat(30) + 'b'.repeat(30)],
      ['pump', 9],
      ['pump', -1],
      ['split', 'aa|a|abbbbb'],
      ['language', 'nope'],
    ] as OpCall[]) {
      const t = new Timeline(def, settings, 1, [...start, bad]);
      expect(t.endState(), JSON.stringify(bad)).toEqual(before);
      expect(t.entries.at(-1)!.steps).toHaveLength(1);
    }
    const defend = { ...defaults, role: 'defend' as const };
    const d0 = new Timeline(def, defend, 1, [['language', 'anbn']]).endState();
    for (const bad of ['aaaaa|a|bb', 'ε|ε|aaaabbbb', 'aaaa|b|bbb', '1 2 3 4', 'ab'])
      expect(
        new Timeline(def, defend, 1, [
          ['language', 'anbn'],
          ['split', bad],
        ]).endState(),
      ).toEqual(d0);
  });

  it('writes the split count as a plain sum for a small p', () => {
    const kind = def.practice!.find((k) => k.id === 'count-splits')!;
    for (let seed = 1; seed <= 60; seed++) {
      const q = kind.make(makeRng(seed));
      // Was "1 + 2 + … + 2 = 3" and "1 + 2 + … + 3 = 6".
      expect(q.explain).not.toMatch(/… \+ [1-4] =/);
    }
    const small = Array.from({ length: 60 }, (_, k) => kind.make(makeRng(k + 1))).find((q) =>
      q.prompt.includes('p = 3.'),
    )!;
    expect(small.explain).toContain('1 + 2 + 3 = 6');
  });

  it('presets play whole games in either role', () => {
    for (const role of ['prove', 'defend'] as const)
      for (const lemma of ['regular', 'cf'] as const)
        for (const p of [2, 3, 5]) {
          const settings: PumpSettings = { ...defaults, role, lemma, p };
          for (const preset of def.controls.presets!) {
            const calls = preset.make(makeRng(p), 10, settings);
            const t = new Timeline(def, settings, 1, calls);
            checkSteps(t);
            expect(t.endState().winner, preset.label).not.toBeNull();
          }
          for (const l of LANGUAGES)
            expect(
              new Timeline(
                def,
                settings,
                1,
                gameCalls(l.id, l.prover(p, lemma), settings),
              ).endState().winner,
            ).not.toBeNull();
        }
  });

  it('every curated example keeps the invariants', () => {
    for (const ex of def.examples) {
      const settings = { ...defaults, ...ex.settings } as PumpSettings;
      checkSteps(new Timeline(def, settings, ex.seed, ex.ops));
    }
  });
});

describe('drawn text size', () => {
  // The smallest text is the ruler's caption and the i numbers, at 13.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
