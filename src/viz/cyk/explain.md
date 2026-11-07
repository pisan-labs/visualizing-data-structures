# CYK parsing

Given a context-free grammar and a word, does the grammar generate the word? Searching through derivations works until it doesn't: a rule like S → SS can keep a search busy forever. CYK always answers, in Θ(n³·|G|) time for a word of n symbols. It is dynamic programming. Work out which variables derive each short piece of the word, then build longer pieces out of shorter ones.

The catch is that CYK only works on grammars in Chomsky normal form. So there are two jobs: convert the grammar, then fill the table.

| Operation | What it does | Cost |
|---|---|---|
| **Load** rules | Read the grammar and convert it to Chomsky normal form, one stage at a time | O(\|G\|²) usually, exponential at worst |
| **Parse** w | Fill the triangle of cells, bottom row first, then accept if the start variable is in the top cell | Θ(n³·\|G\|) |

The name comes from Cocke, Younger and Kasami, who found it independently in the 1960s.

## Chomsky normal form

A grammar is in Chomsky normal form (CNF) when every rule is one of:
- A → BC, two variables (neither of them the start variable);
- A → a, one terminal;
- S → ε, for the start variable only, and only if the language has the empty word.

Why bother? Because a variable that derives a piece of the word longer than one symbol has to start with A → BC, and then B derives some left part and C derives the rest. Every piece splits into exactly two smaller pieces. That is the whole trick behind the table.

Every context-free grammar can be converted. Sipser does it in four stages, and the page shows each one (or only the result, if you pick that in Options):

1. **A new start variable.** Add S₀ → S, so the start variable never appears on a right side.
2. **Remove ε-rules.** Take A → ε away. Every rule that uses A gets a copy without it: R → uAv adds R → uv. If that empties a right side (R → A), R → ε becomes a new ε-rule to remove later.
3. **Remove unit rules.** Take A → B away and give A all of B's rules instead.
4. **Fix what is left.** Split A → u₁u₂u₃ into a chain, A → u₁A₁ and A₁ → u₂u₃. Then, in any rule with two symbols, swap each terminal a for a new variable U with U → a.

[Every stage of the conversion](#example:conversion) has an ε-rule, unit rules, a long rule and a terminal in the wrong place. Step through it slowly. The crossed-out rules are the ones each stage removes; the green ones are new.

```check
Q: Removing the ε-rule A → ε from a grammar with the rule S → AbA adds which rules?
- S → bA only
- S → b only
* S → bA, S → Ab and S → b
= Each A can be left out or kept, independently. Leaving out one, the other, or both gives three new rules.
```

That check is also why the conversion can blow up. A right side with k variables that can all vanish turns into up to 2ᵏ − 1 right sides. [Nullable variables multiply rules](#example:nullable-blowup) turns S → ABCD into 15. Splitting long rules before removing ε-rules avoids this, but the page follows Sipser's order, blow-up and all.

## Filling the table

Write the word along the bottom. The cell in row ℓ above symbol i holds the set of variables that derive the ℓ symbols starting at i. Sipser calls it table(i, j), for the piece from position i to position j.

- **The bottom row** is easy: table(i, i) gets every variable A with a rule A → wᵢ.
- **Every row above** comes from the rows below it. For the piece from i to j, try every place k to cut it into a left part (i to k) and a right part (k+1 to j). For each rule A → BC, if B is in the left part's cell and C is in the right part's, A goes in.
- **The answer** is in the top cell, the one for the whole word. Accept if the start variable is there.

During a split, the blue cell is the one being filled and the two orange cells are its left and right parts. The rules that match turn purple. Set the detail level to show every step to see each split; at the normal level you see one step per cell. [aⁿbⁿ: aabb in, aab out](#example:anbn) [Show me](#play:anbn)

```check
Q: How many splits does CYK try for a word of 4 symbols?
- 4
* 10
- 64
= Cells of 2 symbols have 1 split each (3 cells), cells of 3 have 2 (2 cells), and the top cell has 3: 3 + 4 + 3 = 10. In general (n³ − n)/6.
```

## Why Θ(n³·|G|)

Count the loops. There are n(n+1)/2 cells. Each one tries up to n − 1 splits. Each split checks every rule A → BC. That's three nested loops over the word and one over the rules: Θ(n³·|G|), and Θ(n²) cells of space.

Notice what's missing: there is no best case. CYK fills every cell for every word, even one it could have rejected after the bottom row. Compare that with searching for a derivation, which is quick when it gets lucky and may never finish when it doesn't. [Balanced parentheses](#example:balanced) gives a search a hard time, and costs CYK the same 35 splits as any other word of 6 symbols.

Ambiguity costs nothing either. If a+a*a has two parse trees, E reaches the top cell twice, from two different splits, but a set holds E once. [An ambiguous grammar costs CYK nothing extra](#example:ambiguous)

## Reading back a parse tree

The table says yes or no. To get a tree, remember how each variable got into its cell: which rule, and where the cut was. Start from S₀ in the top cell and follow the rule down into the two cells below, again and again, until you reach the bottom row. The page draws the tree at the end of every parse that accepts.

It's a binary tree, because every rule is A → BC or A → a. It is a tree for the CNF grammar, though, with the new variables S₀, U₁ and S₁ in it. Mapping it back to the grammar you typed means undoing the conversion, which is more bookkeeping than insight.

## When to use it

CYK is the textbook answer to "is membership decidable for context-free languages?" Yes, and here is a cubic algorithm. It handles any context-free grammar, ambiguous or not, and its cost doesn't depend on the grammar's quirks.

It is not what compilers use. Programming languages are designed so that a parser can read the input left to right, once, in linear time (LL and LR parsers, the kind yacc and ANTLR build). Cubic is far too slow for a source file of 100,000 tokens. CYK and its relatives (Earley's algorithm, GLR) show up where grammars are ambiguous by nature: natural language processing, and parsing RNA structure in bioinformatics.

## Common mistakes

- Running CYK on a grammar that isn't in CNF. A rule like S → aSb doesn't fit the A → BC split, so the table quietly misses it.
- Putting the start variable on a right side. That's what S₀ → S is for.
- Forgetting the empty word. The table has no cell for ε; check for S₀ → ε instead. [The empty word needs S₀ → ε](#example:empty-word)
- Mixing up the two parts of a split: B must derive the left part and C the right part, not the other way round.
- Stopping at the first match in a cell. A cell is a set: keep trying every split and every rule, or a later cell may miss a variable.

## Try this

- [A grammar already in Chomsky normal form](#example:classic). Before each cell is filled, predict its set from the two cells below. Turn on every step to check the splits.
- [aⁿbⁿ: aabb in, aab out](#example:anbn). Both fill the whole table. Where does aab go wrong?
- [Every stage of the conversion](#example:conversion). Which stage adds the most rules?
- [Expressions with precedence, conversion skipped](#example:result-only). Then switch Options to show each stage and load the same grammar. All 19 stages.
- Type `S -> aSa | bSb | a | b | eps`, press Load, then parse abba and abab.
