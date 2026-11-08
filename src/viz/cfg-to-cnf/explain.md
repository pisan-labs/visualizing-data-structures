# CFG to Chomsky normal form

A context-free grammar can have rules of any shape: S → ASA, A → B, B → ε. That freedom is nice when you write a grammar and annoying when you want to prove something about it or parse with it. Chomsky normal form (CNF) allows exactly three shapes:

- A → BC, two variables, neither of them the start variable;
- A → a, one terminal;
- S₀ → ε, for the start variable only, and only if the language has the empty word.

Every context-free grammar can be converted to CNF without changing its language. This page does it in five stages and shows the grammar after each step. Rules a step removes are crossed out; rules it adds are green.

| Operation | What it does | Cost |
|---|---|---|
| **Convert** rules | START, DEL, UNIT, TERM and BIN, one step at a time | O(\|G\|²) usually, exponential at worst |
| **Derive** w | Finds a parse tree in the new grammar and replays it as a leftmost derivation | 2n − 1 steps for n symbols |
| **Load** rules | Shows a grammar as typed, without converting it | O(\|G\|) |

## The five stages

1. **START.** Add S₀ → S. Now the start variable never appears on a right side, so later stages can't put it inside a word.
2. **DEL.** Remove the ε-rules. First find the *nullable* variables, the ones that can derive ε. Then every rule gets copies with nullable variables left out, in every combination. Then the ε-rules go (S₀ → ε stays if S₀ is nullable).
3. **UNIT.** Remove unit rules like A → B. A unit rule only renames, so find the *unit pairs* (A, B): A becomes B by unit rules alone. A gets every rule of B that is not itself a unit rule, and then the unit rules go.
4. **TERM.** A terminal in a right side of two or more symbols gets a variable of its own: U₁ → a, and U₁ replaces a there.
5. **BIN.** A right side with three or more symbols becomes a chain of pairs: A → XYZ turns into A → XA₁ and A₁ → YZ.

[Every stage has work](#example:every-stage) is Sipser's grammar, which has something for each stage. Step through it slowly. [Show me](#play:every-stage)

The order matters. START has to come first, or DEL and UNIT can't keep the start variable off the right sides. DEL comes before UNIT because removing ε-rules makes new unit rules: S → AB with B nullable gives S → A. Swap them and you are left with unit rules at the end.

## Nullable variables and unit pairs

Both sets are found the same way: start with the obvious ones and keep adding until nothing changes. That is a fixed point, and it always ends because there are only so many variables.

- **Nullable:** A is nullable if A → ε is a rule, or if A has a right side made only of nullable variables. In [Nullable takes two rounds](#example:nullable-chain), A and B come from their ε-rules, and only then does S → AB make S nullable.
- **Unit pairs:** every (A, A) is one. If (A, B) is one and B → C is a unit rule, (A, C) is one too. In [A chain of unit rules](#example:expressions), E reaches T and F, so E picks up T*F, (E) and a.

```check
Q: The grammar has S → AbA, A → aA | ε. DEL keeps S → AbA and adds which rules for S?
- S → bA only
- S → b only
* S → bA, S → Ab and S → b
= Each A can be left out or kept on its own. Leaving out the first, the second, or both gives three new rules.
```

## Two orders for the last stages

Textbooks disagree on TERM and BIN. Hopcroft, Motwani and Ullman (and Wikipedia) do TERM first; Sipser splits long rules first and then fixes terminals in the pairs. Both end in CNF for the same language, sometimes with different variable names. Pick the order in Options and compare [BIN before TERM, as Sipser does it](#example:sipser-order) with the default.

The order that matters more is DEL against BIN. DEL on a right side with k nullable variables can make 2ᵏ − 1 copies. [Nullable variables multiply rules](#example:nullable-blowup) turns S → ABC into seven right sides, and S₀ copies all of them. Doing BIN before DEL keeps every right side at two symbols, so DEL adds at most three copies per rule and the conversion stays polynomial. The textbook order is easier to follow, so the page uses it, blow-up and all.

## Why bother?

Because CNF makes every parse tree a binary tree. A word of n symbols always has a derivation of exactly 2n − 1 steps: n − 1 rules A → BC to make n variables, and n rules A → a to turn them into letters. [aⁿbⁿ, then a derivation in 2n − 1 steps](#example:anbn-derive) converts S → aSb | ε and derives aabb in seven steps.

That shape is what [CYK parsing](/cyk/) needs. It fills a table of substrings, and every substring longer than one symbol splits into exactly two parts, one per variable of A → BC. The pumping lemma for context-free languages uses the same fact: a binary tree with many leaves has to be tall, so some variable repeats on a path.

```check
Q: In a grammar in CNF, how many steps does a leftmost derivation of a word of 5 symbols take?
- 5
* 9
- It depends on the parse tree
= 4 rules A → BC make 5 variables and 5 rules A → a turn them into letters: 2n − 1 = 9, for every tree.
```

## When to use it (and when not)

Use CNF when an algorithm or a proof needs a fixed shape: CYK, the pumping lemma, deciding whether a language is empty, or showing that every context-free language is decidable.

Don't use it to *write* grammars. The result is longer and much harder to read than what you started with; compare the expression grammar before and after. Compilers don't convert to CNF either. They keep the grammar readable and use LL or LR parsers, which want their own shapes.

## Common mistakes

- **Forgetting S₀.** Without START, a rule like S → SS keeps the start variable on a right side, and S → ε then breaks CNF.
- **Leaving out only one occurrence at a time.** S → AbA with A nullable needs S → b too, both A's gone at once.
- **Dropping ε entirely.** If the start was nullable, keep S₀ → ε. Otherwise the language lost ε.
- **Removing unit rules before ε-rules.** DEL can create new unit rules, which then never get removed.
- **Copying unit rules in UNIT.** A takes the rules of B that are *not* unit rules; the unit pairs already cover the chains.
- **Unreachable leftovers.** After UNIT, S may have no rule pointing at it any more. That is harmless (still CNF), and some books add a stage to remove useless variables. This page leaves them in.

## Try this

- Convert S → SS | (S) | ε. How many unit pairs are there, and where does S → S go?
- Type a grammar already in CNF, say S → AB | a; A → a; B → b. Which stages still do something? [Nearly in CNF already](#example:already-close)
- Convert S → aSb | ε with each order in Options. Do you get the same rules?
- Derive the same word in a grammar before and after you add an extra unit rule. The number of steps stays 2n − 1. Why?
