# Grammars, derivations and parse trees

A context-free grammar is a handful of rewrite rules. Start with one symbol, keep replacing variables using the rules, and stop when only terminals are left. Every string you can reach that way is in the language. That's it.

Here is the whole grammar for aⁿbⁿ (some a's followed by the same number of b's):

```
S → aSb | ε
```

S is the start variable. Capitals are variables, lowercase letters (and symbols like `(`, `+`) are terminals, and ε is the empty string. The `|` is shorthand for two rules, S → aSb and S → ε. A finite automaton cannot recognize aⁿbⁿ, because it would have to count without a bound. Two rules do it.

| Operation | What it does | Cost |
|---|---|---|
| **Load** rules | Read the grammar; the first rule's variable is the start | O(\|G\|) |
| **Derive** w | Search for a leftmost derivation of w, then play it one rule per step | exponential in general |
| **Ambiguity** w | Search for two different parse trees of w | exponential in general |

Type a grammar in one line, rules separated by `;`, like `E -> E+T | T; T -> a`. Write `eps` (or ε) for the empty string.

## Derivations

A derivation is the list of strings you pass through on the way from S to a word. Each string is a sentential form, a mix of variables and terminals, and each arrow ⇒ applies one rule to one variable:

S ⇒ aSb ⇒ aaSbb ⇒ aabb

When a form has two or more variables, which one do you replace next? It doesn't change the language, but it does change the list of forms. A leftmost derivation always replaces the leftmost variable. A rightmost derivation always replaces the rightmost one. The page does leftmost by default, the way Sipser does, and the **Which variable each step replaces** option switches.

Watch the blue cell in the row: that is the variable the next step replaces. The green cells are what the last step wrote. [aⁿbⁿ, one pair at a time](#example:anbn) [Show me](#play:anbn)

```check
Q: With S → aSb | ε, how many steps does a derivation of aaabbb take?
- 3
* 4
- 6
= Three steps of S → aSb build aaaSbbb, then S → ε removes the S. One step per rule used.
```

## Parse trees

A derivation is a list. A parse tree is the same information drawn as a tree. The root is S. Each time a step replaces a variable A with β, A's node gets the symbols of β as children. Read the leaves left to right (skipping ε) and you get the word.

Count the inner nodes of the tree. That's the number of steps, every time.

So what happens with a rightmost derivation? The forms are different and the tree grows from the right instead of the left, but the finished tree is the same. Try [the same word, rightmost](#example:rightmost) and compare it with [the leftmost version](#example:precedence). A tree throws away the order of the steps and keeps only which rule built what, which is why trees, not derivations, are what we compare.

## How the page finds a derivation

The page searches. It keeps a queue of sentential forms, starting with S. It takes the oldest form, tries every rule on its leftmost variable, and queues the new forms. The first time a form equals w, it follows the forms back to S and plays them for you. Breadth-first means the derivation it finds is a shortest one.

Searching blindly would never end, so the search drops a form when:
- the terminals before its first variable don't match the start of w (they can never change again in a leftmost derivation);
- even the shortest word it could produce is longer than w;
- it is longer than any form a smallest parse tree for w could need.

If the queue runs dry, no derivation exists and w is not in the language. [A word the grammar cannot derive](#example:not-in-language) runs out after a handful of forms.

There is a catch. Rules like S → SS can make longer and longer strings of S's that all might still fit. For [balanced parentheses](#example:balanced) that is fine when the word is in the language: the search finds it quickly. When it isn't, the search can grind through thousands of forms. The page gives up at 10,000 and asks CYK instead. [When the search gives up](#example:gives-up) [Show me](#play:gives-up)

This is the reason CYK exists. It converts the grammar to Chomsky normal form first, and then deciding membership is Θ(n³·|G|), for any context-free grammar, every time. Have a look at the CYK page.

## Ambiguity

A grammar is ambiguous if some word has two different parse trees. (Equivalently, two different leftmost derivations.) Is that a problem? For a language of strings, no. For a programming language, very much, because the tree is the meaning.

Here is a grammar for arithmetic:

```
E → E+E | E*E | (E) | a
```

It describes exactly the right strings. It also gives a+a*a two trees: one where the * is lower in the tree, meaning a+(a*a), and one where the + is lower, meaning (a+a)*a. A calculator built from the second tree gets the wrong answer. [Without precedence, a+a*a has two trees](#example:two-trees) [Show me](#play:two-trees)

The fix is one variable per level of precedence:

```
E → E+T | T
T → T*F | F
F → (E) | a
```

A * can only come from T, and T sits below E, so the * always ends up lower in the tree. Same language, one tree per word. [With precedence, a+a*a has one tree](#example:precedence)

```check
Q: With E → E+E | E*E | (E) | a, which word has two parse trees?
- a+a
* a+a*a
- (a+a)
= a+a has only E → E+E at the root. a+a*a can put either the + or the * at the root.
```

The classic ambiguity in real languages is the dangling else. In `if c1 if c2 s1 else s2`, which `if` does the `else` belong to? With i for if, e for else and a for a statement, S → iS | iSeS | a gives iiaea two trees. C, Java and friends settle it with a side rule (the else goes with the nearest if) rather than a cleverer grammar. [The dangling else](#example:dangling-else)

Two warnings. First, the Ambiguity button checks one word. Finding one tree for a+a*a says nothing about other words. Second, no algorithm can decide whether an arbitrary grammar is ambiguous. And some languages are inherently ambiguous: every grammar for them is ambiguous. Not every problem has a fix.

## Where you'll meet grammars

Every programming language has one. The syntax in a language reference is a grammar, usually written in BNF (`<expr> ::= <expr> + <term>`), which is the same thing with more angle brackets. Parser generators like yacc, bison and ANTLR take a grammar and give you a parser. JSON, SQL and HTML have grammars too.

Grammars also mark the line between regular and context-free languages. A grammar whose rules all look like A → wB or A → w (terminals, then at most one variable at the end) is right-linear, and its language is regular. The page tells you when you load one. Anything that needs matching pairs, such as parentheses, aⁿbⁿ or palindromes, needs more than that. A pushdown automaton recognizes exactly the context-free languages, by keeping the unmatched half on a stack.

## Common mistakes

- Treating a derivation and a parse tree as the same thing. Many derivations (leftmost, rightmost, and everything in between) can give one tree.
- Calling a grammar ambiguous because a word has a leftmost and a rightmost derivation that differ. They always differ. Ambiguity needs two different trees, or two different leftmost derivations.
- Forgetting the ε-rule, so the recursion never stops. S → aSb alone generates nothing at all.
- Fixing precedence and breaking associativity. E → T+E gives the same strings as E → E+T, but it groups a+a+a from the right.
- Assuming a grammar search will always finish. With ε-rules and S → SS, it may not.

## Try this

- [aⁿbⁿ, one pair at a time](#example:anbn). Before you press play, count the steps.
- [A word the grammar cannot derive](#example:not-in-language). Watch how few forms the search needs to give up honestly.
- [Palindromes grow from the outside in](#example:palindromes). Compare abbba with abba: how does each one end?
- [Without precedence, a+a*a has two trees](#example:two-trees). Find the node where the two trees part ways.
- [With precedence, a+a*a has one tree](#example:precedence), then switch to rightmost and derive a+a*a again.
- [The dangling else](#example:dangling-else). Which tree matches the rule "else goes with the nearest if"?
- Load `S -> aS | bS | eps` and derive abba. The page tells you this grammar is right-linear. What regular expression describes it?
