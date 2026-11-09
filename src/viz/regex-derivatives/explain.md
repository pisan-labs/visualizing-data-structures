# Regular expression derivatives

Here is a question you can ask any regular expression r: if a word starts with the symbol c, what must the rest of it look like for the word to match r? The answer is another regular expression, the **derivative** of r by c, written d_c(r). Janusz Brzozowski worked out the rules in 1964. With them you can match a word without building any automaton, and if you keep taking derivatives you get a DFA for free.

| Operation | What it does | Cost |
|---|---|---|
| **Load** | reads an expression, such as `a*(ba)*` | O(m), m its size |
| **Derive** | works out d_c(r) from the smallest parts up | O(m), about twice as large at worst |
| **Match** | one derivative per symbol, then checks ν | O(n·m) for a word of length n, with simplifying |
| **Build DFA** | takes derivatives by every symbol until nothing new turns up | one derivative per state and symbol |

## The rules

ν(r), read "nullable", says whether r matches the empty word. ε, any star and any r? do; a symbol and ∅ don't; a union does if either side does; a concatenation does if both parts do.

The derivative has one rule per kind of expression:

- d_c(c) = ε, and d_c of any other symbol, of ε or of ∅ is ∅.
- d_c(r|s) = d_c(r) | d_c(s). Take c off either side.
- d_c(rs) = d_c(r)s, and if ν(r), also | d_c(s). The c has to come off r, unless r can be empty, in which case it may come off s.
- d_c(r*) = d_c(r)r*. Take c off one copy, then any number of copies again.

The concatenation rule is the one people get wrong. [The derivative by a, part by part](#example:derive-by-a) works through (a|b)*abb from the smallest parts up. The star can be empty, so the a comes off it, giving (a|b)*abb, or off abb, giving bb. Put together: d_a((a|b)*abb) = (a|b)*abb | bb. [Show me](#play:derive-by-a)

[When the first part can be empty](#example:nullable-start) does the same with a*ab, and then takes the derivative by b, which is ∅. No word in a*ab starts with b, and ∅ says so.

```check
Q: What is d_a(ab*)?
- ε
* b*
- ab*|b*
= a is a symbol and cannot be empty, so the a must come off it: d_a(a)·b* = ε·b* = b*.
```

## Matching without an automaton

To match a word, take one derivative per symbol and look at what is left. If what is left matches the empty word, the word matches. That's it. [Matching a word by derivatives](#example:match-abb) reads aabb: after the last b, what's left is (a|b)*abb|ε, which is nullable, so aabb matches. aba ends on (a|b)*abb|bb, which isn't. [Show me](#play:match-abb)

If a derivative is ∅, you can stop early: nothing can follow. [A derivative of ∅ stops the match](#example:empty-derivative) gives up on ba after one symbol.

## Simplifying, or things get out of hand

Taken literally, the rules make a mess: εb, ∅|bb, (a|b)*abb|(a|b)*abb. So the page builds every expression with smart constructors that tidy up as they go: ∅|r is r, ∅r is ∅, εr is r. Those are the basic rules.

They are not enough. [Without similarity, a*a* keeps growing](#example:repeats-grow): d_a(a*a*) = a*a* | a*, the next derivative adds another a*, and so on forever. Brzozowski's fix is to treat | as associative, commutative and idempotent: keep the alternatives in a fixed order and drop repeats. He called expressions equal under those rules **similar**, and proved that every expression has only finitely many derivatives up to similarity. Switch **Simplify** in Options to compare. [Show me](#play:repeats-grow)

Similarity is not equivalence. With it, a*a* stops at two states, a*a* and a*|a*a*, though both mean a*. Deciding whether two expressions mean the same language is harder, and you don't need it. Finitely many is enough.

## A DFA from derivatives

Make each derivative a state. The start state is r. The move from state q on c goes to d_c(q). A state accepts when its expression is nullable. Keep going until every move leads to a state you already have. [The DFA of derivatives: words ending in abb](#example:abb-dfa) finds four expressions: (a|b)*abb, then with |bb, |b and |ε. That is the minimal DFA. [Show me](#play:abb-dfa)

You don't always get the minimal one, because similar is weaker than equivalent, but you get a DFA with no NFA in between and no subset construction. Some languages need big DFAs whatever you do. [Three from the end: eight states](#example:kth-from-end) needs 2³ = 8 states to remember the last three symbols, and the derivatives find all eight. Make it the tenth symbol from the end and you need 1,024.

```check
Q: A state's expression is (a|b)*abb|ε. Is it an accepting state?
* Yes
- No
= It has ε as an alternative, so it matches the empty word: ν is true.
```

## When to use it

Derivatives are popular in functional languages and in some regex libraries, because the code is short: a dozen lines for ν, a dozen for d_c, and the smart constructors. They handle extras that are awkward for NFAs: intersection and complement have simple derivative rules too (d_c(r&s) = d_c(r)&d_c(s)), which Thompson's construction can't do directly. Lexer generators such as ml-ulex build their DFAs this way.

Avoid them when the expressions blow up. Matching one long word by derivatives keeps rebuilding expressions; for many words, build the DFA once (or use an NFA simulation) instead. The textbook route is [Thompson's construction](/regex-to-nfa/) and then the subset construction; derivatives get to a DFA in one step.

[Union written as +](#example:plus-for-union) is the same page with Hopcroft and Ullman's notation: the rules don't change, only the sign.

## Common mistakes

- **Dropping the second half of the concatenation rule.** If r can be empty, d_c(rs) also has d_c(s). Forget it and d_a(a*ab) comes out as a*ab, with the b missing.
- **Losing the star.** d_c(r*) is d_c(r)r*, not d_c(r): after one copy, more copies may follow.
- **Mixing up ε and ∅.** d_a(a) is ε (nothing left to read, and that's fine). d_a(b) is ∅ (no way to go on). ε matches one word; ∅ matches none.
- **Checking the wrong thing at the end.** A word matches when the last derivative is nullable, not when it is ε. (a|b)*abb|ε is not ε, and it still accepts.
- **Skipping the similarity rules when building a DFA.** Without them the loop may never stop.

## Try this

- [The derivative by a](#example:derive-by-a): before pressing Derive, work out d_b((a|b)*abb) on paper. Then check it.
- Load `(ab|b)*` and build the DFA. How many states, and which ones accept?
- [Matching a word by derivatives](#example:match-abb): match babb, then abab. What is left after each word, and why does abab fail even though it ends in b?
- [Three from the end](#example:kth-from-end): load `(a|b)*a(a|b)` instead. How many states now?
- Load `a*b*`, build the DFA, then load `(a|b)*`. Which one has a dead state, ∅?
