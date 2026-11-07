import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EPS,
  checkDerivation,
  classify,
  cyk,
  cykTree,
  derives,
  formatGrammar,
  inLanguage,
  isCnf,
  makeGrammar,
  minLengths,
  parseGrammar,
  parseRules,
  parseWord,
  searchDerivation,
  toCnf,
  treeOf,
  treeYield,
  wordsUpTo,
  type Grammar,
  type Rule,
  type Sym,
} from './grammar';

const G = (text: string): Grammar => {
  const g = parseGrammar(text);
  if (g instanceof Error) throw g;
  return g;
};

const ANBN = 'S -> aSb | eps';
const PARENS = 'S -> SS | (S) | eps';
const AMBIGUOUS = 'E -> E+E | E*E | (E) | a';
const PRECEDENCE = 'E -> E+T | T; T -> T*F | F; F -> (E) | a';
const SIPSER = 'S -> ASA | aB; A -> B | S; B -> b | eps';

/** Every word over the alphabet up to length n, as symbol arrays. */
function allWords(alphabet: Sym[], n: number): Sym[][] {
  const out: Sym[][] = [[]];
  let layer: Sym[][] = [[]];
  for (let k = 1; k <= n; k++) {
    layer = layer.flatMap((w) => alphabet.map((a) => [...w, a]));
    out.push(...layer);
  }
  return out;
}

/** Random grammars over S, A, B and a, b: right sides of 0 to 3 symbols. */
const symArb = fc.constantFrom('S', 'A', 'B', 'a', 'b');
const ruleArb = fc.record({
  lhs: fc.constantFrom('S', 'A', 'B'),
  rhs: fc.array(symArb, { maxLength: 3 }),
});
const grammarArb = fc.array(ruleArb, { minLength: 1, maxLength: 7 }).map((rules) => {
  // The first rule is for S, so S is the start.
  const all = rules[0]!.lhs === 'S' ? rules : [{ lhs: 'S', rhs: ['a'] }, ...rules];
  const seen = new Set<string>();
  const unique = all.filter((r) => {
    const k = `${r.lhs}>${r.rhs.join('')}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return makeGrammar('S', unique as Rule[]);
});

describe('grammar text', () => {
  it('reads variables, terminals and ε', () => {
    const g = G('S -> aSb | eps; T -> (T) | ε');
    expect(g.start).toBe('S');
    expect(g.variables).toEqual(['S', 'T']);
    expect(g.terminals).toEqual(['a', 'b', '(', ')']);
    expect(g.rules.map((r) => r.rhs.join(''))).toEqual(['aSb', '', '(T)', '']);
    expect(G('S → a S b').rules[0]!.rhs).toEqual(['a', 'S', 'b']);
  });

  it('reads subscripted variables, as the CNF conversion writes them', () => {
    const g = G('S₀ -> U₁S₁ | ε; S₁ -> SU₂; U₁ -> a');
    expect(g.variables).toEqual(['S₀', 'S₁', 'U₁', 'S', 'U₂']);
  });

  it('names the rule that is wrong', () => {
    const msg = (t: string) => (parseGrammar(t) as Error).message;
    expect(msg('S aSb')).toContain('"S aSb" has no arrow');
    expect(msg('S -> a | ')).toContain('"S -> a |" has an empty alternative');
    expect(msg('aS -> b')).toContain('"aS -> b": the left side must be one variable');
    expect(msg('a -> b')).toContain('needs a variable');
    expect(msg('S -> a -> b')).toContain('two arrows');
    expect(msg('S -> a₁')).toContain('may only follow a variable');
    expect(msg('')).toContain('Type a grammar first');
  });

  it('writes grammars that read back the same', () => {
    for (const t of [ANBN, PARENS, AMBIGUOUS, PRECEDENCE, SIPSER]) {
      const g = G(t);
      expect(G(formatGrammar(g))).toEqual(g);
      expect(G(formatGrammar(g, true))).toEqual(g);
    }
    // Rules come back grouped by variable: the same rules, and the same text again.
    const key = (g: Grammar) => g.rules.map((r) => `${r.lhs}>${r.rhs.join(' ')}`).sort();
    fc.assert(
      fc.property(grammarArb, (g) => {
        const back = G(formatGrammar(g, true));
        expect(key(back)).toEqual(key(g));
        expect(back.start).toBe(g.start);
        expect(formatGrammar(back)).toBe(formatGrammar(g));
      }),
    );
  });

  it('reads words and checks their symbols', () => {
    const g = G(ANBN);
    expect(parseWord('a a b b', g)).toEqual(['a', 'a', 'b', 'b']);
    expect(parseWord('eps', g)).toEqual([]);
    expect(parseWord('ε', g)).toEqual([]);
    expect((parseWord('abc', g) as Error).message).toContain('"c" is not a terminal');
    expect((parseWord('aSb', g) as Error).message).toContain('capitals are variables');
  });
});

describe('the Chomsky hierarchy', () => {
  const level = (t: string) => {
    const p = parseRules(t);
    if (p instanceof Error) throw p;
    return classify(p);
  };

  it('puts each grammar at the most restrictive level its rules fit', () => {
    expect(level('S -> aS | bA | eps; A -> aA | b').level).toBe('regular');
    expect(level(ANBN).level).toBe('context-free');
    expect(level(PRECEDENCE).level).toBe('context-free');
    expect(level('S -> aSBc | abc; cB -> Bc; bB -> bb').level).toBe('context-sensitive');
    expect(level('S -> aSBC | eps; CB -> BC; aB -> ab; bB -> bb; bC -> bc; cC -> cc').level).toBe(
      'unrestricted',
    );
    expect(level('S -> aTb | eps; aT -> a').level).toBe('unrestricted');
  });

  it('says which rule rules out each lower level', () => {
    const c = level('S -> aSb | ab');
    expect(c.misses[0]).toMatchObject({ level: 'regular', rule: 'S → aSb' });
    expect(c.misses[0]!.why).toContain('terminal comes after the variable');
    const cs = level('S -> aSBc | abc; cB -> Bc; bB -> bb');
    expect(cs.misses.map((m) => m.level)).toEqual(['regular', 'context-free']);
    expect(cs.misses[1]!.rule).toBe('cB → Bc');
  });

  it('allows S → ε in a context-sensitive grammar only when S is on no right side', () => {
    expect(level('S -> eps | T; T -> aTb | ab; aT -> aaT').level).toBe('context-sensitive');
    expect(level('S -> eps | aS; aS -> aa').level).toBe('unrestricted');
  });
});

describe('derivations', () => {
  it('finds the shortest leftmost derivation, first in rule order', () => {
    const g = G(ANBN);
    const r = searchDerivation(g, ['a', 'a', 'b', 'b'], 'leftmost');
    expect(r.derivation!.forms.map((f) => f.join(''))).toEqual(['S', 'aSb', 'aaSbb', 'aabb']);
    expect(checkDerivation(g, r.derivation!, ['a', 'a', 'b', 'b'], 'leftmost')).toBeNull();
  });

  it('replaces the leftmost or the rightmost variable', () => {
    const g = G(PRECEDENCE);
    const w = [...'a+a*a'];
    const left = searchDerivation(g, w, 'leftmost').derivation!;
    const right = searchDerivation(g, w, 'rightmost').derivation!;
    expect(left.forms.map((f) => f.join(''))[2]).toBe('T+T');
    expect(right.forms.map((f) => f.join(''))[2]).toBe('E+T*F');
    expect(checkDerivation(g, left, w, 'leftmost')).toBeNull();
    expect(checkDerivation(g, right, w, 'rightmost')).toBeNull();
    // One tree either way: the same nodes, made in a different order.
    const shape = (steps: typeof left.steps) => {
      const t = treeOf(g, steps).trees.at(-1)!;
      const s = (id: number): string =>
        t[id]!.kids.length ? `${t[id]!.sym}(${t[id]!.kids.map(s).join(' ')})` : t[id]!.sym;
      return s(0);
    };
    expect(shape(left.steps)).toBe(shape(right.steps));
  });

  it('builds the parse tree node by node', () => {
    const g = G(ANBN);
    const d = searchDerivation(g, ['a', 'b'], 'leftmost').derivation!;
    const { trees, forms, expanded } = treeOf(g, d.steps);
    expect(trees.map((t) => t.length)).toEqual([1, 4, 5]);
    expect(trees.at(-1)!.at(-1)!.sym).toBe(EPS);
    expect(forms.map((f) => f.map((x) => x.sym).join(''))).toEqual(['S', 'aSb', 'ab']);
    expect(expanded).toEqual([0, 2]);
    expect(treeYield(trees.at(-1)!)).toEqual(['a', 'b']);
  });

  it('fails for a word not in the language, without reaching the cap', () => {
    const r = searchDerivation(G(ANBN), ['a', 'a', 'b'], 'leftmost');
    expect(r.derivation).toBeNull();
    expect(r.capped).toBe(false);
  });

  it('finds two parse trees for a+a*a when there is no precedence', () => {
    const g = G(AMBIGUOUS);
    const w = [...'a+a*a'];
    const r = searchDerivation(g, w, 'leftmost', { two: true });
    expect(r.second).not.toBeNull();
    expect(checkDerivation(g, r.second!, w, 'leftmost')).toBeNull();
    expect(r.second!.steps).not.toEqual(r.derivation!.steps);
    const single = searchDerivation(G(PRECEDENCE), w, 'leftmost', { two: true });
    expect(single.derivation).not.toBeNull();
    expect(single.second).toBeNull();
    expect(single.capped).toBe(false);
  });

  it('agrees with brute force on random grammars', () => {
    fc.assert(
      fc.property(grammarArb, (g) => {
        const lang = wordsUpTo(g, 4);
        for (const w of allWords(['a', 'b'], 4)) {
          const r = searchDerivation(g, w, 'leftmost', { cap: 4000 });
          if (r.capped) continue;
          expect(r.derivation !== null, `${formatGrammar(g)}: ${w.join('')}`).toBe(
            lang.has(w.join('')),
          );
          if (r.derivation) expect(checkDerivation(g, r.derivation, w, 'leftmost')).toBeNull();
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe('Chomsky normal form', () => {
  it('records every stage of the conversion', () => {
    const { stages, cnf } = toCnf(G(SIPSER));
    expect(stages[0]!.kind).toBe('start');
    expect(stages.map((s) => s.kind)).toContain('eps');
    expect(stages.map((s) => s.kind)).toContain('unit');
    expect(stages.map((s) => s.kind)).toContain('long');
    expect(stages.map((s) => s.kind)).toContain('term');
    expect(stages.at(-1)!.grammar).toEqual(cnf);
    expect(cnf.start).toBe('S₀');
    expect(isCnf(cnf)).toBe(true);
  });

  it('removes ε-rules by leaving out each occurrence', () => {
    const { stages } = toCnf(G(SIPSER));
    const eps = stages.find((s) => s.kind === 'eps')!;
    expect(eps.target).toEqual({ lhs: 'B', rhs: [] });
    expect(eps.added.map((r) => `${r.lhs}>${r.rhs.join('')}`)).toEqual(['S>a', 'A>']);
  });

  it('keeps S₀ → ε when the language has the empty word', () => {
    const cnf = toCnf(G(ANBN)).cnf;
    expect(cnf.rules).toContainEqual({ lhs: 'S₀', rhs: [] });
    expect(isCnf(cnf)).toBe(true);
  });

  it('keeps the language: every word up to length 6', () => {
    fc.assert(
      fc.property(grammarArb, (g) => {
        const cnf = toCnf(g).cnf;
        expect(isCnf(cnf), formatGrammar(cnf)).toBe(true);
        const before = wordsUpTo(g, 6);
        const after = wordsUpTo(cnf, 6);
        expect([...after].sort(), formatGrammar(g)).toEqual([...before].sort());
      }),
      { numRuns: 200 },
    );
    for (const t of [ANBN, PARENS, AMBIGUOUS, PRECEDENCE, SIPSER]) {
      const g = G(t);
      expect([...wordsUpTo(toCnf(g).cnf, 6)].sort()).toEqual([...wordsUpTo(g, 6)].sort());
    }
  });
});

describe('CYK', () => {
  it('fills the classic table', () => {
    const g = G('S -> AB | BC; A -> BA | a; B -> CC | b; C -> AB | a');
    const res = cyk(g, [...'baaba']);
    expect(res.table[0]).toEqual([['B'], ['A', 'C'], ['A', 'C'], ['B'], ['A', 'C']]);
    expect(res.table[4]![0]).toEqual(['S', 'A', 'C']);
    expect(res.accept).toBe(true);
    const t = cykTree(g, res, [...'baaba'])!;
    expect(treeYield(t).join('')).toBe('baaba');
  });

  it('decides membership exactly, like brute force', () => {
    fc.assert(
      fc.property(grammarArb, (g) => {
        const cnf = toCnf(g).cnf;
        const lang = wordsUpTo(g, 5);
        for (const w of allWords(['a', 'b'], 5)) {
          const res = cyk(cnf, w);
          expect(res.accept, `${formatGrammar(g)}: ${w.join('')}`).toBe(lang.has(w.join('')));
          if (res.accept) expect(treeYield(cykTree(cnf, res, w)!)).toEqual(w);
        }
      }),
      { numRuns: 80 },
    );
  });

  it('puts a variable in a cell exactly when it derives that substring', () => {
    fc.assert(
      fc.property(grammarArb, fc.array(fc.constantFrom('a', 'b'), { maxLength: 5 }), (g, w) => {
        const cnf = toCnf(g).cnf;
        const res = cyk(cnf, w);
        res.table.forEach((row, l) =>
          row.forEach((cell, i) => {
            const sub = w.slice(i, i + l + 1);
            for (const v of cnf.variables) {
              const asStart = makeGrammar(v, cnf.rules);
              expect(cell.includes(v)).toBe(inLanguage(asStart, sub));
            }
          }),
        );
      }),
      { numRuns: 80 },
    );
  });
});

describe('brute force', () => {
  it('lists short words', () => {
    expect([...wordsUpTo(G(ANBN), 4)].sort()).toEqual(['', 'aabb', 'ab']);
    expect(inLanguage(G(PARENS), [...'(()())'])).toBe(true);
    expect(inLanguage(G(PARENS), [...'(()'])).toBe(false);
    expect(derives(G(PARENS), [...'(()'])).toBe(false);
  });

  it('knows the shortest word of each variable', () => {
    const m = minLengths(G('S -> AB; A -> aA | a; B -> b | C; C -> C'));
    expect(Object.fromEntries(m)).toEqual({ S: 2, A: 1, B: 1, C: Infinity });
  });
});
