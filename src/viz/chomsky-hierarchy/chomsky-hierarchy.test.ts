import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, StageSize } from '../../engine/types';
import { textWidth } from '../../layouts/text';
import type { Bounds, RectShape, Shape } from '../../render/scene';
import {
  LEVELS,
  classify,
  isVariable,
  parseGrammar,
  parseRules,
  wordsUpTo,
  type Production,
  type Sym,
} from '../_grammar/grammar';
import { chomskyHierarchy, driverGrammar, parseInput } from '.';
import { LANGUAGES, findLanguage } from './languages';
import { LEVEL_REGION, REGIONS, checkLevels, inside, type RegionId } from './levels';
import { defaults, regionId, tokenId, type ChSettings } from './model';
import { randomGrammar } from './practice';

const run = (calls: OpCall[], settings: ChSettings = defaults) =>
  new Timeline(chomskyHierarchy, settings, 1, calls);

const SETTINGS: ChSettings[] = [
  defaults,
  { decidable: false, names: 'names' },
  { decidable: true, names: 'types' },
  { decidable: false, names: 'types' },
];

// Random grammars of every kind: left sides of one to three symbols, at least one a variable.
const symArb = fc.constantFrom('S', 'A', 'B', 'a', 'b');
const productionArb: fc.Arbitrary<Production> = fc
  .record({
    lhs: fc.array(symArb, { minLength: 1, maxLength: 3 }),
    rhs: fc.array(symArb, { maxLength: 4 }),
  })
  .filter((p) => p.lhs.some(isVariable));
const grammarArb = fc
  .array(productionArb, { minLength: 1, maxLength: 7 })
  .map((rules) => ({ start: rules[0]!.lhs.find(isVariable)!, rules }));

/** A right-linear rule: one variable on the left, terminals, then at most one variable. */
const rightLinearArb: fc.Arbitrary<Production> = fc
  .record({
    lhs: fc.constantFrom('S', 'A', 'B'),
    w: fc.array(fc.constantFrom('a', 'b'), { maxLength: 3 }),
    v: fc.option(fc.constantFrom('S', 'A', 'B')),
  })
  .map(({ lhs, w, v }) => ({ lhs: [lhs], rhs: v ? [...w, v] : w }));

const text = (rules: readonly Production[]) => driverGrammar(rules);

/**
 * Every word of length at most n a grammar of any kind derives, by breadth-first search over
 * sentential forms no longer than n + slack. For a non-contracting grammar slack 0 finds them all;
 * a grammar that shrinks its forms needs room for the symbols it erases later.
 */
function derivable(start: Sym, rules: readonly Production[], n: number, slack = 0): Set<string> {
  const words = new Set<string>();
  const seen = new Set<string>([start]);
  const queue: Sym[][] = [[start]];
  for (let head = 0; head < queue.length && head < 300_000; head++) {
    const form = queue[head]!;
    if (!form.some(isVariable)) {
      words.add(form.join(''));
      continue;
    }
    for (const p of rules) {
      for (let i = 0; i + p.lhs.length <= form.length; i++) {
        if (!p.lhs.every((s, k) => form[i + k] === s)) continue;
        const next = [...form.slice(0, i), ...p.rhs, ...form.slice(i + p.lhs.length)];
        const key = next.join(' ');
        if (next.length > n + slack || seen.has(key)) continue;
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return new Set([...words].filter((w) => w.length <= n));
}

/** Every word over the letters up to length n. */
function allWords(letters: string, n: number): string[] {
  let level = [''];
  const out = [''];
  for (let k = 1; k <= n; k++) {
    level = level.flatMap((w) => [...letters].map((c) => w + c));
    out.push(...level);
  }
  return out;
}

describe('chomsky-hierarchy: classifying grammars', () => {
  it('agrees with the shared classify() on random grammars, level and missed rule alike', () => {
    fc.assert(
      fc.property(grammarArb, (g) => {
        const mine = checkLevels(g.start, g.rules);
        const shared = classify(g);
        expect(mine.level).toBe(shared.level);
        const misses = mine.checks.filter((c) => c.miss >= 0);
        expect(misses.map((c) => c.level)).toEqual(shared.misses.map((m) => m.level));
        misses.forEach((c, k) => {
          const p = g.rules[c.miss]!;
          const shown = `${p.lhs.join('')} → ${p.rhs.length ? p.rhs.join('') : 'ε'}`;
          expect(shown).toBe(shared.misses[k]!.rule);
        });
      }),
      { numRuns: 400 },
    );
  });

  it('never moves a grammar inward when a rule is added', () => {
    fc.assert(
      fc.property(grammarArb, productionArb, (g, extra) => {
        const before = checkLevels(g.start, g.rules).level;
        const after = checkLevels(g.start, [...g.rules, extra]).level;
        expect(LEVELS.indexOf(after)).toBeGreaterThanOrEqual(LEVELS.indexOf(before));
      }),
      { numRuns: 400 },
    );
  });

  it('classifies random right-linear grammars as regular, in one pass', () => {
    fc.assert(
      fc.property(fc.array(rightLinearArb, { minLength: 1, maxLength: 6 }), (rules) => {
        const all = rules[0]!.lhs[0] === 'S' ? rules : [{ lhs: ['S'], rhs: ['a'] }, ...rules];
        const t = run([['classify', text(all)]]);
        const g = t.endState().grammar!;
        expect(g.result.level).toBe('regular');
        expect(g.result.checks).toHaveLength(1);
        // One fine step per rule, then the verdict.
        const p = parseRules(text(all)) as { rules: Production[] };
        expect(t.entries[0]!.steps).toHaveLength(p.rules.length + 1);
      }),
      { numRuns: 150 },
    );
  });

  it('moves L(G) only outward, one level per failed check, and lands where classify() says', () => {
    fc.assert(
      fc.property(grammarArb, fc.constantFrom(...SETTINGS), (g, settings) => {
        const t = run([['classify', text(g.rules)]], settings);
        const steps = t.entries[0]!.steps;
        let last = -1;
        for (const s of steps) {
          const gi = s.state.grammar!;
          const k = LEVELS.indexOf(gi.result.checks[gi.at]!.level);
          expect(k).toBeGreaterThanOrEqual(last);
          last = k;
          // Every rule a fine step looks at fits; the step after the fine steps names the miss.
          if (s.level === 3) {
            const rule = s.extra!.rule!;
            const check = gi.result.checks[gi.at]!;
            expect(check.miss < 0 || rule < check.miss).toBe(true);
          }
        }
        const end = t.endState().grammar!;
        expect(end.result.level).toBe(classify(g).level);
        expect(steps.at(-1)!.marks).toContainEqual({
          id: regionId(LEVEL_REGION[end.result.level]),
          role: 'found',
        });
      }),
      { numRuns: 120 },
    );
  });

  it('builds random grammars that land on the level asked for', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const level of LEVELS) {
        for (const size of [3, 5, 8]) {
          const g = run([['classify', randomGrammar(makeRng(seed), level, size)]]).endState();
          expect(g.grammar!.result.level, `${level}, seed ${seed}`).toBe(level);
        }
      }
    }
  });

  it('refuses input it cannot use, saying why', () => {
    const t = run([
      ['classify', 'anbn'],
      ['classify', 'S -> a -> b'],
      ['classify', 'banana'],
      ['place', 'S -> aSb | eps'],
      ['place', 'zebra'],
      ['place', 42],
    ]);
    const say = t.entries.map((e) => e.steps.at(-1)!.say);
    expect(say[0]).toContain('aⁿbⁿ is a language: press Place');
    expect(say[1]).toContain('two arrows');
    expect(say[2]).toContain('is not a grammar');
    expect(say[3]).toContain('That is a grammar');
    expect(say[4]).toContain('"zebra" is not one of the languages');
    expect(say[5]).toContain('"42" is not one of the languages');
    expect(t.endState()).toEqual(t.initial.state);
    expect(parseInput('S -> aSb | eps')).toBe('S -> aSb | eps');
    expect(parseInput('a^n b^n')).toBe('a^n b^n');
    expect(parseInput('aⁿbⁿcⁿ')).toBe('aⁿbⁿcⁿ');
    expect(parseInput('zebra')).toBeInstanceOf(Error);
    expect(parseInput('S -> ')).toBeInstanceOf(Error);
  });

  it('names the rule that breaks each level in the narration', () => {
    const t = run([['classify', 'S -> aSB | eps; aB -> Ba; B -> b']]);
    const misses = t.entries[0]!.steps.filter((s) => s.lines.includes('classify.miss'));
    expect(misses.map((s) => s.say)).toEqual([
      expect.stringContaining('S → aSB is not: it has 2 variables on the right (S, B)'),
      expect.stringContaining('aB → Ba is not: its left side, aB, is 2 symbols'),
      expect.stringContaining('S → ε is allowed only when S is on no right side'),
    ]);
    expect(t.entries[0]!.steps.at(-1)!.say).toContain('unrestricted');
  });
});

describe('chomsky-hierarchy: placing languages', () => {
  it('gives every language a claim that puts it in its region and one that keeps it out of the next', () => {
    for (const l of LANGUAGES) {
      const ins = l.claims.filter((c) => c.kind === 'in');
      const outs = l.claims.filter((c) => c.kind === 'out');
      expect(ins.length + outs.length, l.id).toBe(l.claims.length);
      if (l.home === 'all') expect(ins, l.id).toHaveLength(0);
      else
        expect(
          ins.map((c) => c.region),
          l.id,
        ).toEqual([l.home]);
      if (l.home === 'reg') expect(outs, l.id).toHaveLength(0);
      else {
        // The region just inside home is the one ruled out (all languages: r.e.).
        expect(outs, l.id).toHaveLength(1);
        expect(REGIONS.indexOf(outs[0]!.region), l.id).toBe(REGIONS.indexOf(l.home) - 1);
        expect(outs[0]!.tool, l.id).toBeTruthy();
      }
      expect(findLanguage(l.id)).toBe(l);
      expect(findLanguage(l.token)).toBe(l);
      for (const a of l.aliases) expect(findLanguage(a), a).toBe(l);
    }
  });

  it('ends every Place with the token in its home region, under every setting', () => {
    for (const settings of SETTINGS) {
      for (const l of LANGUAGES) {
        const t = run([['place', l.id]], settings);
        const steps = t.entries[0]!.steps;
        expect(steps).toHaveLength(l.claims.length + 1);
        for (const s of steps) {
          const scene = chomskyHierarchy.view(s, settings);
          expect(scene.shapes.some((x) => x.id === tokenId(l.id))).toBe(true);
        }
        const home = l.home === 'dec' && !settings.decidable ? 're' : l.home;
        expect(steps.at(-1)!.marks).toContainEqual({ id: regionId(home), role: 'found' });
        expect(t.endState().placed).toEqual([l.id]);
      }
    }
  });

  it('keeps one token per language when a language is placed twice', () => {
    const t = run([
      ['place', 'anbn'],
      ['place', 'ww'],
      ['place', 'anbn'],
    ]);
    expect(t.endState().placed).toEqual(['ww', 'anbn']);
  });

  it('names grammars that generate exactly the language, up to a length', () => {
    for (const l of LANGUAGES.filter((x) => x.grammar)) {
      const g = parseRules(l.grammar!) as { start: Sym; rules: Production[] };
      // A claim's grammar is never above the region it claims.
      expect(inside(l.home, LEVEL_REGION[checkLevels(g.start, g.rules).level]), l.id).toBe(true);
      const cf = parseGrammar(l.grammar!);
      const n = 7;
      const got = cf instanceof Error ? derivable(g.start, g.rules, n) : wordsUpTo(cf, n);
      const want = allWords(l.id === 'anbncn' ? 'abc' : 'ab', n).filter(l.member!);
      expect([...got].sort(), l.id).toEqual(want.sort());
    }
  });

  it('has an unrestricted example grammar whose words are the powers of 2', () => {
    const ex = chomskyHierarchy.examples.find((e) => e.id === 'unrestricted')!;
    const g = parseRules(String(ex.ops[0]![1])) as { start: Sym; rules: Production[] };
    expect(checkLevels(g.start, g.rules).level).toBe('unrestricted');
    const pow2 = LANGUAGES.find((l) => l.id === 'pow2')!;
    const words = derivable(g.start, g.rules, 8, 3);
    expect([...words].sort()).toEqual(allWords('a', 8).filter(pow2.member!).sort());
  });

  it('has a context-free example grammar whose language is regular', () => {
    const ex = chomskyHierarchy.examples.find((e) => e.id === 'cf-but-regular')!;
    const g = parseGrammar(String(ex.ops[0]![1]));
    if (g instanceof Error) throw g;
    const abstar = LANGUAGES.find((l) => l.id === 'abstar')!;
    expect([...wordsUpTo(g, 8)].sort()).toEqual(allWords('ab', 8).filter(abstar.member!).sort());
    const t = run(ex.ops);
    expect(t.entries[0]!.end.grammar!.result.level).toBe('context-free');
    expect(t.entries[1]!.steps.at(-1)!.marks).toContainEqual({
      id: regionId('reg'),
      role: 'found',
    });
  });
});

describe('chomsky-hierarchy: the code tabs', () => {
  it('expects the level and the rule that rules out the level below', () => {
    const ex = chomskyHierarchy.examples.find((e) => e.id === 'four-levels')!;
    const { input, expected } = chomskyHierarchy.code!.script(ex.ops, defaults);
    expect(input).toEqual([
      'classify S -> aS; S -> b',
      'classify S -> aSb; S -> ab',
      'classify S -> abc; S -> aSBc; cB -> Bc; bB -> bb',
      'classify S -> aSB; S -> eps; aB -> Ba; B -> b',
    ]);
    expect(expected).toEqual([
      'regular',
      'context-free (not regular: S -> aSb)',
      'context-sensitive (not context-free: cB -> Bc)',
      'unrestricted (not context-sensitive: S -> eps)',
    ]);
  });

  it('leaves out grammars the drivers cannot read, and refused operations', () => {
    const { input } = chomskyHierarchy.code!.script(
      [
        ['classify', 'S₀ -> S; S -> a'],
        ['classify', 'S -> e p s'],
        ['place', 'anbn'],
        ['classify', 'nonsense'],
        ['classify', 'S -> a'],
      ],
      defaults,
    );
    expect(input).toEqual(['classify S -> a']);
  });
});

// ---------------------------------------------------------------------------------------------
// The drawing

const STAGES: (StageSize | undefined)[] = [undefined, { w: 880, h: 384 }, { w: 360, h: 536 }];

const contains = (o: Bounds, i: Bounds, slack = 0.5) =>
  i.x >= o.x - slack &&
  i.y >= o.y - slack &&
  i.x + i.w <= o.x + o.w + slack &&
  i.y + i.h <= o.y + o.h + slack;
const overlaps = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const textBox = (s: Shape): Bounds | null => {
  if (s.kind !== 'text') return null;
  const size = s.size ?? 16;
  const w = textWidth(s.text, size, s.mono, s.weight === 'bold');
  const x = s.anchor === 'middle' ? s.x - w / 2 : s.x;
  return { x, y: s.y - size * 0.8, w, h: size };
};

describe('chomsky-hierarchy: the map', () => {
  const calls: OpCall[] = [
    ...LANGUAGES.map((l): OpCall => ['place', l.id]),
    ['classify', 'S -> ACaB | a; Ca -> aaC; CB -> DB | E; aD -> Da; AD -> AC; aE -> Ea; AE -> eps'],
  ];

  it('nests the regions, keeps every token in its own ring, and keeps the panel off the map', () => {
    for (const settings of SETTINGS) {
      const t = run(calls, settings);
      for (let i = 0; i < t.length; i += 3) {
        const step = t.at(i).step;
        for (const stage of STAGES) {
          const scene = chomskyHierarchy.view(step, settings, stage);
          const rect = (id: string) =>
            scene.shapes.find((s): s is RectShape => s.kind === 'rect' && s.id === id);
          const regions = REGIONS.map((r) => ({ r, b: rect(regionId(r)) })).filter((x) => x.b);
          for (let k = 0; k + 1 < regions.length; k++)
            expect(contains(regions[k + 1]!.b!, regions[k]!.b!)).toBe(true);
          const map = regions.at(-1)!.b!;
          const tokens = scene.shapes.filter(
            (s): s is RectShape => s.kind === 'rect' && s.id.startsWith('tok-'),
          );
          for (const tok of tokens) {
            // The region it sits in contains it; the one inside does not touch it.
            const k = regions.findIndex((x) => contains(x.b!, tok));
            expect(k, tok.id).toBeGreaterThanOrEqual(0);
            if (k > 0) expect(overlaps(regions[k - 1]!.b!, tok), tok.id).toBe(false);
            if (tok.id !== tokenId('G')) {
              const l = LANGUAGES.find((x) => tokenId(x.id) === tok.id)!;
              const home: RegionId = l.home === 'dec' && !settings.decidable ? 're' : l.home;
              expect(regions[k]!.r, tok.id).toBe(home);
            }
            for (const other of tokens)
              if (other !== tok) expect(overlaps(tok, other), `${tok.id} ${other.id}`).toBe(false);
          }
          // Titles and details stay inside their own band, clear of the region inside.
          for (const { r, b } of regions) {
            for (const s of scene.shapes.filter((x) => x.id.startsWith(`${regionId(r)}-`))) {
              const box = textBox(s)!;
              expect(contains(b!, box, 2), s.id).toBe(true);
              const inner = regions[regions.findIndex((x) => x.r === r) - 1];
              if (inner) expect(overlaps(inner.b!, box), s.id).toBe(false);
              for (const tok of tokens) expect(overlaps(tok, box), `${tok.id} ${s.id}`).toBe(false);
            }
          }
          // The panel (rules, checks, claims) is beside or under the map, not on it.
          const panel = scene.shapes.filter((s) => /^(r-|check-|claim-|lang-)/.test(s.id));
          for (const s of panel) {
            const box = textBox(s);
            if (box) expect(overlaps(map, box), s.id).toBe(false);
          }
        }
      }
    }
  });

  it('puts the panel beside the map on a laptop and under it on a phone', () => {
    const t = run([['place', 'anbn']]);
    const step = t.entries[0]!.steps.at(-1)!;
    const at = (stage: StageSize) => {
      const scene = chomskyHierarchy.view(step, defaults, stage);
      const map = scene.shapes.find((s) => s.id === regionId('all')) as RectShape;
      const title = scene.shapes.find((s) => s.id === 'lang-title') as Shape & {
        x: number;
        y: number;
      };
      return title.x > map.x + map.w ? 'beside' : title.y > map.y + map.h ? 'under' : 'on';
    };
    expect(at({ w: 880, h: 384 })).toBe('beside');
    expect(at({ w: 360, h: 536 })).toBe('under');
  });
});
