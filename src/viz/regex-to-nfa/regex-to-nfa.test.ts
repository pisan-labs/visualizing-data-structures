import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { accepts } from '../_automata/automaton';
import { matches, parseRegex, showRegex, type Regex } from '../_automata/regex';
import { construct, pending, type Construction } from './construct';
import { parse, show, size, type UnionSign } from './syntax';

/** Random expressions over {a, b}, written with the given union sign. */
function regexArb(sign: UnionSign): fc.Arbitrary<Regex> {
  const { tree } = fc.letrec<{ tree: Regex }>((tie) => ({
    tree: fc.oneof(
      { depthSize: 'small', withCrossShrink: true },
      fc.constantFrom<Regex>(
        { kind: 'sym', c: 'a' },
        { kind: 'sym', c: 'b' },
        { kind: 'eps' },
        { kind: 'empty' },
      ),
      fc.tuple(tie('tree'), tie('tree')).map(([a, b]): Regex => ({ kind: 'union', a, b })),
      fc.tuple(tie('tree'), tie('tree')).map(([a, b]): Regex => ({ kind: 'concat', a, b })),
      tie('tree').map((a): Regex => ({ kind: 'star', a })),
      tie('tree').map((a): Regex => ({ kind: sign === '|' ? 'plus' : 'star', a })),
      tie('tree').map((a): Regex => ({ kind: 'opt', a })),
    ),
  }));
  return tree.filter((r) => show(r, sign).length <= 40);
}

const wordArb = fc.array(fc.constantFrom('a', 'b'), { maxLength: 7 }).map((w) => w.join(''));

describe('reading expressions', () => {
  it('agrees with the kit when | is union', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[ab|*+?()ε∅]{0,12}$/), (text) => {
        const mine = parse(text, '|');
        const kit = parseRegex(text);
        expect(mine instanceof Error, text).toBe(kit instanceof Error);
        if (!(mine instanceof Error) && !(kit instanceof Error)) expect(mine.tree.r).toEqual(kit);
      }),
      { numRuns: 2000 },
    );
  });

  it('reads + as union when asked, and keeps * and ?', () => {
    const p = parse('(a+b)*a?', '+');
    expect(p).not.toBeInstanceOf(Error);
    expect(show((p as Exclude<typeof p, Error>).tree.r, '|')).toBe('(a|b)*a?');
    expect(parse('a|b', '+')).toBeInstanceOf(Error);
    expect((parse('a|b', '+') as Error).message).toContain('+ stands for union');
    expect(parse('a+', '+')).toBeInstanceOf(Error);
  });

  it('prints what it reads, in either sign', () => {
    for (const sign of ['|', '+'] as const)
      fc.assert(
        fc.property(regexArb(sign), (r) => {
          const p = parse(show(r, sign), sign);
          expect(p).not.toBeInstanceOf(Error);
          expect((p as Exclude<typeof p, Error>).tree.r).toEqual(r);
        }),
      );
  });

  it('gives every node a span that reads as the node', () => {
    fc.assert(
      fc.property(regexArb('|'), (r) => {
        const p = parse(showRegex(r), '|') as Exclude<ReturnType<typeof parse>, Error>;
        const check = (t: typeof p.tree) => {
          const sub = parse(p.text.slice(...t.span), '|');
          expect(sub).not.toBeInstanceOf(Error);
          expect((sub as typeof p).tree.r).toEqual(t.r);
          t.kids.forEach(check);
        };
        check(p.tree);
      }),
    );
  });

  it('reads eps as ε and ignores spaces', () => {
    const p = parse(' a eps | b ', '|') as Exclude<ReturnType<typeof parse>, Error>;
    expect(p.text).toBe('aε|b');
    expect(size(p.tree.r)).toBe(4);
  });
});

describe.each(['thompson', 'sipser'] as Construction[])('%s construction', (how) => {
  for (const sign of ['|', '+'] as const)
    it(`accepts exactly the words the expression matches (union ${sign})`, () => {
      fc.assert(
        fc.property(regexArb(sign), fc.array(wordArb, { maxLength: 6 }), (r, words) => {
          const p = parse(show(r, sign), sign) as Exclude<ReturnType<typeof parse>, Error>;
          const { nfa } = construct(p, how);
          for (const w of ['', ...words])
            expect(accepts(nfa, w), `${show(r)} on "${w}"`).toBe(matches(r, w));
        }),
        { numRuns: 400 },
      );
    });

  it('builds children before parents, one fragment per part', () => {
    fc.assert(
      fc.property(regexArb('|'), (r) => {
        const p = parse(show(r), '|') as Exclude<ReturnType<typeof parse>, Error>;
        const { nfa, frags } = construct(p, how);
        frags.forEach((f, k) => {
          for (const j of f.kids) expect(j).toBeLessThan(k);
          const kidStates = f.kids.flatMap((j) => frags[j]!.states);
          expect(new Set([...kidStates, ...f.fresh]).size).toBe(f.states.length);
          expect(f.moves.length).toBe(
            f.kids.reduce((s, j) => s + frags[j]!.moves.length, 0) + f.added.length,
          );
        });
        // Each part is used by exactly one parent, and the last part is the whole NFA.
        expect(pending(frags, frags.length)).toEqual([frags.length - 1]);
        const top = frags.at(-1)!;
        expect(top.states).toEqual(nfa.states);
        expect(top.start).toBe(nfa.start);
        expect(top.accepts).toEqual(nfa.accept);
      }),
    );
  });

  it('makes at most 2 states per symbol or operator (Thompson: 4 for ?)', () => {
    fc.assert(
      fc.property(regexArb('|'), (r) => {
        const p = parse(show(r), '|') as Exclude<ReturnType<typeof parse>, Error>;
        const { nfa } = construct(p, how);
        const opts = (show(r).match(/\?/g) ?? []).length;
        const m = size(r);
        if (how === 'thompson') expect(nfa.states.length).toBe(2 * m + 2 * opts);
        else expect(nfa.states.length).toBeLessThanOrEqual(2 * m);
      }),
    );
  });
});
