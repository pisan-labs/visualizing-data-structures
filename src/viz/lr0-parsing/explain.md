# LR(0) parsing

An LR parser reads the input left to right and builds the parse tree from the bottom up. It pushes symbols on a stack (a **shift**) until the top of the stack is a whole right side, then replaces it with the rule's left side (a **reduce**). Do that until only the start variable is left. The hard part is knowing *when* the top of the stack is a right side worth reducing. LR parsers answer it with a finite automaton over the stack, built from **items**.

The name: **L**eft to right, **R**ightmost derivation (in reverse), **0** symbols of lookahead to decide. yacc, Bison and most parser generators build the same kind of table, with a smarter way to decide (LALR(1)).

| Operation | What it does | Cost |
|---|---|---|
| **Load** rules | Builds the LR(0) automaton from items, then the ACTION/GOTO table, flagging conflicts | small for real grammars, exponential at worst |
| **Parse** w | Shifts and reduces on a stack of states until accept or an error | Θ(n) without conflicts |

## Items

An item is a rule with a dot in it: E → E•+T says "I've seen an E, and if a + and a T come next, this rule is done." An item with the dot at the end, T → a•, is **complete**: time to reduce.

Two operations build everything:
- **closure**: if the dot is before a variable B, the parser might be about to see anything B derives, so add B → •γ for every rule of B. Repeat.
- **goto(I, X)**: take the items of I with X after the dot, move the dot past X, and take the closure.

Start from I0 = closure({ S' → •S }), where S' → S is a new rule added so accepting is one clear step. Follow every symbol after a dot to a new set, and keep going until no new sets turn up. Each set is a state of the LR(0) automaton. [Item sets, closure and goto](#example:build-automaton) builds all nine states of the default grammar. Bold items are the kernel; the others came from closure.

```check
Q: I contains T → (•E). The rules of E are E → E+T and E → T. What does closure add?
- Nothing: the dot is not at the start
* E → •E+T and E → •T, then T's rules with the dot at the start
- Only E → •E+T
= The dot is before E, so E's rules come in. One of them has the dot before T, so T's rules come in too.
```

## The table

Each state is a row:
- an arrow on a terminal a to state j is **ACTION[i, a] = shift j** (sj);
- an arrow on a variable A to state j is **GOTO[i, A] = j**;
- a complete item A → α• is **reduce by A → α** (r and the rule's number). In LR(0) it goes under *every* terminal and $;
- S' → S• is **accept** under $.

A cell with two actions is a **conflict**. A complete item next to an item that shifts is a *shift-reduce* conflict; two complete items in one state are a *reduce-reduce* conflict. [Precedence makes LR(0) conflicts](#example:shift-reduce): after a T, should the parser reduce to E or shift a *? LR(0) can't tell.

## SLR(1)

LR(0) reduces no matter what comes next. That's wasteful: it only makes sense to reduce to E if the next symbol can follow an E. **SLR(1)** (simple LR) puts the reduce only under FOLLOW(A). In the precedence grammar FOLLOW(E) = { +, ), $ }, so E → T• no longer fights with the shift on *. Switch the setting in Options and compare [SLR(1) looks at FOLLOW](#example:slr-fixes-it).

ε-rules are the other common case. S → • is complete in I0 of S → aSb | ε, so LR(0) reduces under a too, where it should shift. SLR(1) is fine. [An ε-rule: LR(0) conflict, SLR(1) fine](#example:empty-rule)

SLR(1) is not magic. [Two complete items: reduce-reduce](#example:reduce-reduce) has FOLLOW(A) = FOLLOW(B), and the conflict stays. LR(1) and LALR(1) carry lookahead inside the items to do better; that's what Bison builds.

```check
Q: A state has E → T• and T → T•*F. FOLLOW(E) = { +, ), $ }. In SLR(1), what is in the cell under *?
- reduce by E → T only
* shift only
- both: a conflict
= * is not in FOLLOW(E), so the reduce doesn't go there. Only the shift from T → T•*F does.
```

## The parse

The stack holds states, with the symbols that led to them in between. Start with state 0. Then repeat with the top state s and the next symbol a:
- **shift j**: push a and j, read on;
- **reduce A → β**: pop |β| states (and symbols), look at the state now on top, and push A and GOTO[that state, A];
- **accept**: done;
- an empty cell: syntax error.

[(a+a)+a, shift and reduce](#example:parens-sum) [Show me](#play:parens-sum)

The reductions, read from last to first, are a rightmost derivation. The parser builds it backwards, which is why it can wait to decide until it has seen a whole right side, and why left recursion is no problem at all (compare [LL(1) parsing](/ll1-parsing/), where it is fatal). Errors are found at the first symbol that can't continue: [An empty cell is a syntax error](#example:syntax-error).

## When to use it

You'll almost never build an LR table by hand, and you shouldn't. Parser generators do it, and they handle grammars that LL(1) can't: left recursion, operators written the natural way. LR(0) itself is too weak for most real grammars. It is the skeleton the others share, and the easiest one to draw. SLR(1) handles many textbook grammars; LALR(1) handles most programming languages.

The cost is that the tables are hard to read and the error messages are famously unhelpful. "syntax error near line 42" is an empty cell.

## Common mistakes

- **Forgetting closure on a goto.** Moving the dot is half of it. The new set needs the rules for whatever variable the dot is now in front of.
- **Comparing kernels, but storing sets.** Two gotos with the same items are the same state; check the whole set (or the kernel, consistently).
- **Popping the wrong number of states.** A reduce by A → β pops |β| states. An ε-rule pops none.
- **Using the state you reduced from for GOTO.** Use the state *uncovered* after popping.
- **Putting accept under every terminal.** It goes under $ only.

## Try this

- Load S → (L) | x; L → S | L,S and parse ((x),x). How deep does the stack get?
- Load S → aSb | eps with LR(0), then with SLR(1). Which cell causes the trouble?
- Find a grammar that is SLR(1) but not LR(0), and one that is neither. (Hint: the examples have one of each.)
- Parse a+a in the default grammar and count the moves: shifts plus reductions. How does the count relate to the parse tree?
