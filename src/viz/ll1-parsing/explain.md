# LL(1) parsing

An LL(1) parser reads the input once, left to right, and builds the parse tree from the top down. At each step it looks at one symbol of input, the *lookahead*, and a table tells it which rule to use. No backing up, no guessing, linear time. The name says it: **L**eft to right, **L**eftmost derivation, **1** symbol of lookahead.

The catch is that not every grammar works. The table has to have at most one rule in each cell, and finding out means computing two sets for every variable first.

| Operation | What it does | Cost |
|---|---|---|
| **Load** rules | Computes FIRST and FOLLOW to a fixed point, then fills the table and reports conflicts | O(\|G\|·\|V\|·\|T\|) |
| **Parse** w | Runs the predictive parser on w$, with a stack, growing the tree | Θ(n) for an LL(1) table |

## FIRST and FOLLOW

**FIRST(A)** is the set of terminals that can start a string A derives, plus ε if A can vanish. For a whole right side, FIRST(X₁X₂…) is FIRST(X₁) without ε; if X₁ can vanish, add FIRST(X₂), and so on. ε is in it only if every symbol can vanish.

**FOLLOW(A)** is the set of terminals that can come right after A in some sentential form, with $ for the end of the input. For each rule A → αBβ:
- everything in FIRST(β) except ε follows B;
- if β can vanish (or is empty), everything that follows A also follows B.

Both are fixed points. Start with empty sets (and FOLLOW(S) = { $ }), go through the rules, add what each rule says, and repeat until a whole round changes nothing. [FIRST, FOLLOW and the table](#example:build-sets) does this for the expression grammar. Set the detail to show every step to see each set grow.

```check
Q: With E' → +TE' | ε and FIRST(T) = { (, a }, what is FIRST(TE')?
- { (, a, + }
* { (, a }
- { (, a, ε }
= T cannot vanish, so FIRST(TE') stops at FIRST(T). E' never gets a say.
```

## The table

For each rule A → α:
- put it in M[A, a] for every terminal a in FIRST(α);
- if α can vanish, also put it in M[A, b] for every b in FOLLOW(A), $ included.

The second rule is the one people forget. It says: drop A (use its ε-rule) exactly when the next symbol is something that can come *after* A. In [Balanced parentheses with an ε-rule](#example:balanced), S → ε goes under ) and $, because those are the only symbols that can follow an S.

If no cell gets two rules, the grammar is LL(1). If one does, that's a **conflict**, drawn in red with its reason:
- **FIRST/FIRST**: two rules for A can start with the same terminal. Left recursion always does this: E → E+T and E → T both start with whatever T starts with. [Left recursion is never LL(1)](#example:left-recursion)
- **FIRST/FOLLOW**: one rule can vanish, and a terminal that follows A can also start the other rule. The dangling else is the classic. [The dangling else: a FIRST/FOLLOW conflict](#example:dangling-else)

## The parse

The stack starts as $ S, start variable on top. Then repeat:
- a terminal on top that matches the lookahead: pop it, read the next symbol (a **match**);
- a variable A on top: look up M[A, a], pop A, push the right side backwards so its first symbol is on top (an **expand**), and give A's node in the tree its children;
- anything else is a syntax error.

When the stack and the input are both down to $, accept. The expansions happen in exactly the order of a leftmost derivation, which is why the tree grows top down and left to right. [a+a*a, top down](#example:expressions) [Show me](#play:expressions)

Errors are found early, at the first symbol that can't continue anything valid. [A syntax error found at once](#example:syntax-error) stops at the * in a+*a.

```check
Q: The stack is $ E' T and the lookahead is a. M[T, a] is T → FT'. What is the stack after the move?
- $ E' F T'
* $ E' T' F
- $ T' F E'
= Pop T, push FT' backwards: T' first, then F, so F is on top.
```

## Fixing a grammar that is not LL(1)

Two standard rewrites handle most cases:
- **Remove left recursion.** E → E+T | T becomes E → TE', E' → +TE' | ε. Same language, and now the parser reads a T before deciding anything.
- **Left factor.** A → ab | ac becomes A → aA', A' → b | c. Postpone the choice until the symbols differ.

The expression grammar on this page is the result of the first rewrite. Some languages have no LL(1) grammar at all, and the dangling else is usually solved by cheating: take the first rule and document that else goes with the nearest if. Set Options to take the first rule and try iiaea.

What happens if you cheat on left recursion? [Guessing on a conflict loops forever](#example:guess-goes-wrong). E becomes E+T, which becomes E+T+T, and the parser never reads a symbol. The page gives up after 40 moves. A real parser would not.

## When to use it

LL(1) parsers are easy to write by hand: one function per variable, a switch on the lookahead, and the call stack plays the role of the stack here. That's *recursive descent*, and plenty of production compilers use it (GCC and Clang both parse C++ this way, with a lot of extra tricks). ANTLR generates LL parsers with more lookahead.

They are less powerful than LR parsers ([LR(0) parsing](/lr0-parsing/) builds the other kind): LR handles left recursion directly and accepts more grammars. The price is a table nobody wants to build by hand.

## Common mistakes

- **Forgetting FOLLOW for ε-rules.** Without it, the parser has no rule to drop a nullable variable, and rejects good input.
- **Putting ε in FOLLOW.** FOLLOW sets hold terminals and $, never ε.
- **Stopping FIRST of a string too late or too early.** Go on to the next symbol only when the current one can vanish.
- **Pushing the right side the wrong way round.** The first symbol of the rule has to end up on top.
- **One round of FIRST.** A set can grow because of a set computed later in the same round. Keep going until a round changes nothing.

## Try this

- Load S → aSb | ε and parse aabb. Why is S → ε under b and $?
- Left-factor S → ab | ac yourself and load both versions. Which one has a conflict?
- Load E → E+T | T; T → a with conflicts set to take the first rule, and parse a. Count how fast the stack grows.
- Load L → aL'; L' → ,aL' | ε and parse a,a,a. How many moves does a list of k items take?
