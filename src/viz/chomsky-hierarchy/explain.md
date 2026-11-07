# The Chomsky hierarchy

Four classes of languages, each one inside the next:

regular ⊂ context-free ⊂ context-sensitive ⊂ recursively enumerable

Each level comes with a machine that recognizes its languages and a shape of grammar rule that generates them. Go out one level and you get a stronger machine, looser rules and a harder question about membership. Go past the last one and there is no machine at all.

| Level | Machine | Grammar rules | Is w in L? (\|w\| = n) |
|---|---|---|---|
| Regular (Type 3) | finite automaton | A → wB or A → w | Θ(n), one move per symbol |
| Context-free (Type 2) | pushdown automaton | A → γ | Θ(n³·\|G\|) with CYK |
| Context-sensitive (Type 1) | linear-bounded automaton | α → β with \|α\| ≤ \|β\| | decidable, PSPACE-complete in general |
| Recursively enumerable (Type 0) | Turing machine | α → β | undecidable |

In the rules, capitals are variables, w is a string of terminals, γ is any string, and α and β are strings with at least one variable in α.

Noam Chomsky numbered these types in the late 1950s while looking for a theory of grammar for natural languages, so Type 0 is the most general and Type 3 the most restricted. Sipser names the classes of languages instead, and adds one more between the last two: the decidable languages. The **Show the decidable languages** option draws that band, and **Name the levels** switches between names and types.

The page does two things.

| Operation | What it does | Cost |
|---|---|---|
| **Classify** a grammar | Check the rules against each level's form, from regular out, and stop at the first level every rule fits | Θ(\|G\|) |
| **Place** a language | Put a language on the map, with one claim for where it is and one for why it is no lower | one step per claim |

Type a grammar on one line, such as `S -> aSb | eps`, and press Classify. Or type one of `a*`, `(ab)*`, `a*b*`, `anbn`, `pal`, `anbncn`, `ww`, `pow2`, `diag`, `halt` or `cohalt` and press Place. [The whole map](#example:whole-map) places all of them.

## Regular languages (Type 3)

The machine is a finite automaton. Deterministic or not, it recognizes the same languages, and so do regular expressions. It has a fixed number of states and no other memory, so everything it knows about the input so far has to fit in one state.

The grammar is right-linear: every rule is A → wB or A → w, some terminals and then at most one variable, at the end. Read the variable as the state. S → aA means "in S, read a, go to A", and A → ε means A accepts. [Right-linear rules: a regular grammar](#example:right-linear) is a two-state DFA written as rules. [Show me](#play:right-linear)

Regular languages are closed under almost everything: union, intersection, complement, concatenation, star and reversal. Run two DFAs side by side for intersection; swap the accepting states for complement.

Just outside: aⁿbⁿ. Checking that the b's match the a's needs counting, and a fixed number of states can only count so far. The pumping lemma makes that precise. Take s = aᵖbᵖ, with p the pumping length. The piece y that pumps lies in the first p symbols, so it is all a's, and pumping it once more leaves more a's than b's. [aⁿbⁿ: context-free, not regular](#example:anbn) [Show me](#play:anbn)

Now compare a*b*. It looks almost the same, but nothing has to match, so two states do it. Place `a*b*` and see where it lands.

## Context-free languages (Type 2)

The machine is a pushdown automaton: a finite automaton with a stack. Push the a's, pop one for each b, and aⁿbⁿ is easy. Nondeterminism matters here. A deterministic pushdown automaton recognizes fewer languages (it cannot guess where the middle of a palindrome is), which is why programming languages stick to grammars a deterministic parser can handle.

The grammar has one variable on the left of every rule: A → γ. Whatever is around A, it can be replaced. That is where "context-free" comes from.

Closure is where people slip. Context-free languages are closed under union, concatenation and star: glue the grammars together with a new start variable. They are not closed under intersection. aⁿbⁿcᵐ and aᵐbⁿcⁿ are both context-free, and their intersection is aⁿbⁿcⁿ, which is not. Union works and intersection doesn't, so complement can't work either (De Morgan). Intersection with a regular language does work, and it shows up in a lot of proofs.

Just outside: aⁿbⁿcⁿ and ww. The pumping lemma for context-free languages pumps two pieces, v and y, but they sit within p symbols of each other, so they cannot reach all three blocks of aᵖbᵖcᵖ. [aⁿbⁿcⁿ needs context](#example:anbncn)

The pair I like best is palindromes against ww. A palindrome is a word followed by its mirror image, and a stack hands symbols back in exactly that order. ww is a word followed by a copy, and the stack hands them back in the wrong order. One is context-free. The other is not. [Mirroring is context-free, copying is not](#example:copy-vs-mirror) [Show me](#play:copy-vs-mirror)

```check
Q: L₁ and L₂ are context-free. Which of these must be context-free too?
- L₁ ∩ L₂
* L₁ ∪ L₂
- The complement of L₁
= Union is safe: S → S₁ | S₂ joins the two grammars. Intersection is not (aⁿbⁿcᵐ ∩ aᵐbⁿcⁿ is aⁿbⁿcⁿ), and so complement is not either.
```

## Context-sensitive languages (Type 1)

The machine is a linear-bounded automaton, a Turing machine that never moves its head off the input. It can rewrite the input as often as it likes, but it gets no extra tape. Kuroda showed in 1964 that these machines recognize exactly the context-sensitive languages.

The grammar form on this page is non-contracting: no rule makes the string shorter, so |α| ≤ |β|. The one exception is S → ε, allowed when S appears on no right side, so the empty word can be in the language. Chomsky's original form was αAβ → αγβ: replace A with γ, but only between α and β. That is the context. Both forms generate the same languages, and non-contracting rules are easier to write. Here is aⁿbⁿcⁿ:

```
S → T | ε
T → aTBC | aBC
CB → BC
aB → ab    bB → bb    bC → bc    cC → cc
```

T lays down the a's, with a B and a C for each one. CB → BC sorts the B's ahead of the C's. The lowercase rules turn B into b and C into c, but only next to the right neighbour, so the conversion runs left to right. A derivation that converts too early gets stuck with a capital it can never get rid of. [aⁿbⁿcⁿ needs context](#example:anbncn) checks the rules one level at a time. [Show me](#play:anbncn)

Why is every context-sensitive language decidable? No rule shrinks the string, so a derivation of a word of length n only passes through forms of length n or less. There are finitely many of those, and a search can try them all. Finitely many is still a lot. Membership is PSPACE-complete in general: linear space is enough, and nobody knows how to do it in polynomial time.

Closure: union, intersection, concatenation, star and complement. Complement took until 1987, when Immerman and Szelepcsényi showed, independently, that nondeterministic space is closed under complement. Whether deterministic linear-bounded automata are as strong as nondeterministic ones is still open.

Just outside: a language that is decidable but not context-sensitive. Take D, the descriptions of linear-bounded automata that do not accept their own description. D is decidable: on n cells such a machine has finitely many configurations, so you can run it until it halts or repeats one. But no linear-bounded automaton recognizes D, because one that did would accept its own description exactly when it doesn't. That is diagonalization, the same trick as the halting problem one level out.

## Decidable languages

A decider is a Turing machine that halts on every input, with a yes or a no. Sipser's hierarchy of languages puts the decidable ones between context-sensitive and recursively enumerable. Chomsky's hierarchy of grammars has no type for them. So the two line up like this: Type 3 is regular, Type 2 is context-free, Type 1 is context-sensitive, Type 0 is recursively enumerable, and the decidable band sits between Type 1 and Type 0 with no grammar form of its own.

Why no grammar form? A form is something you check by looking at the rules. You cannot tell by looking at a Turing machine whether it halts on every input (the machines that do are not even recognizable as a set), and no form of rule picks out exactly the decidable languages either.

Closure: union, intersection, complement, concatenation and star. Complement is the easy one: swap accept and reject.

Just outside: HALT = { ⟨M, w⟩ : M halts on w }. A recognizer is easy: simulate M on w and accept when it halts. A decider is impossible. [The halting problem and its complement](#example:halting) [Show me](#play:halting)

## Recursively enumerable languages (Type 0)

A Turing machine recognizes L if it accepts every word in L. On a word outside L it may reject, or it may run forever, and from the outside you cannot tell which. Unrestricted grammars, α → β with anything at all on the right, generate exactly these languages. A rule can erase now, so a derivation can grow, shrink and grow again, and there is no bound on how long a search for a derivation might take. That is the whole difference from Type 1.

Closure: union, intersection, concatenation and star. Not complement. If L and its complement were both recognizable, you could run the two recognizers side by side. One of them must accept, so together they decide L.

Just outside: co-HALT, the pairs where M does not halt on w. HALT is recognizable and not decidable, so its complement is not recognizable. No machine and no grammar.

The outer box is most of the picture. There are countably many Turing machines (each one is a finite string) and uncountably many languages, so almost every language has no machine at all. The ones we can name are the odd ones out.

## The form is an upper bound

Classify looks at the rules, not at the language. A grammar whose rules fit Type 2 generates a context-free language, but that language may be regular too. S → SS | ab | ε is not right-linear (S → SS has two variables on the right), and it generates (ab)*, which is as regular as it gets. [A context-free grammar for a regular language](#example:cf-but-regular) [Show me](#play:cf-but-regular)

The same goes one level out. [An unrestricted grammar for a context-sensitive language](#example:unrestricted) erases its end markers with CB → E and AE → ε, so its rules are Type 0. Its language, aᵏ for k a power of 2, is context-sensitive.

So a grammar's level is an upper bound on its language's level. To pin the language down you need the other half, a pumping lemma or a diagonal argument that it is no lower, and that is what Place shows, one claim per step. Don't expect an algorithm to do it for you: whether a context-free grammar generates a regular language is undecidable.

Classify starts with regular. At the finest detail level it checks one rule per step; the first rule that breaks the form turns red, and L(G) moves out one ring. Then context-free, then context-sensitive. A grammar that fails all three is unrestricted. Adding a rule can only move a grammar out, never in: a new rule can break a form, but it cannot fix a rule that already broke one. [One grammar for each type](#example:four-levels) runs four grammars with Chomsky's numbering. The last is caught by S → ε, because S also appears on a right side.

```check
Q: Classify puts S → aSb | ab at context-free. What does that tell you about its language?
- It is context-free and not regular
* It is context-free, and it may or may not be regular
- It is not context-sensitive
= The form is an upper bound. This language happens to be aⁿbⁿ with n ≥ 1, which is not regular, but the grammar alone does not prove it. The pumping lemma does.
```

## Common mistakes

- Thinking the levels are separate boxes. They are nested: aⁿ is regular, and so it is also context-free, context-sensitive and recursively enumerable. Where a language goes on the map is the innermost box it fits in.
- Reading a grammar's type as its language's type. The type is an upper bound.
- Forgetting that the left side of a right-linear or context-free rule is one variable. aB → abB is not right-linear, even though its right side looks fine.
- Allowing ε-rules everywhere in a context-sensitive grammar. Only S → ε, and only when S is on no right side.
- Mixing up recognizable and decidable. A recognizer may run forever on a word outside L. A decider never does.
- Using the pumping lemma to show a language is regular. Pumping can only show a language is not regular; some languages pass the pumping test and still are not regular.

## Try this

- [Right-linear rules: a regular grammar](#example:right-linear). Add A → aSb to the grammar and classify it again. Where does L(G) go?
- [aⁿbⁿ: context-free, not regular](#example:anbn). Before you press play, say which rule breaks the regular form, and why.
- [A context-free grammar for a regular language](#example:cf-but-regular). Write a right-linear grammar for (ab)* and classify that.
- [Mirroring is context-free, copying is not](#example:copy-vs-mirror). Why does a stack help with one and not the other?
- [One grammar for each type](#example:four-levels). Take S → ε out of the last grammar. What level is it now, and what does it generate?
- [The halting problem and its complement](#example:halting). Then turn off **Show the decidable languages**. Where does HALT go now?
- [The whole map](#example:whole-map). Step back through it and predict each claim before you see it.
