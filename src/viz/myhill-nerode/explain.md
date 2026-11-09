# Myhill-Nerode theorem

A DFA reads a word and remembers only its state. So two words that end in the same state must be treated alike forever after: whatever you append, both are accepted or both are rejected. The Myhill-Nerode theorem turns that around. It looks at the language alone, no machine anywhere, and asks which words have to be remembered differently. The answer tells you exactly how many states the smallest DFA needs, and whether any DFA can work at all.

| Operation | What it does | Cost |
|---|---|---|
| **Load** | reads a language: a regular expression, a DFA or NFA, or `anbn` and `equal`, which no DFA accepts | the subset construction, for an expression or an NFA |
| **Find classes** | sorts words into classes, starting from ε, and builds the minimal DFA | O(k²·\|Σ\|) comparisons for k classes |
| **Words apart** | finds the shortest suffix that tells each pair of the words you type apart | O(n²·\|Σ\|) per pair, n the DFA's states |
| **Infinitely many** | shows ε, a, aa, ... pairwise told apart, for a language with no DFA | one suffix per pair |

## Telling words apart

Words x and y are **told apart** by a suffix z when exactly one of xz and yz is in L. If no suffix tells them apart, they are **equivalent**, x ≡ y. Equivalent words can share a state; words told apart cannot, because the state would have to accept and reject the same suffix.

Take L = words ending in ab. The words a, ba and bba all end in a, and nothing you append can treat them differently. [Equivalent words: they end the same way](#example:equivalent-words) checks all six pairs of a, ba, bba and ab: the first three are equivalent, and ab is told apart from each of them by ε itself, since ab is in L. [Show me](#play:equivalent-words)

```check
Q: L = words ending in ab. Which suffix tells a from b apart?
- a
* b
- ab
= ab is in L and bb is not. Appending a gives aa and ba, both out; appending ab gives aab and bab, both in.
```

## Classes are states

≡ splits all words into classes. The theorem: L is regular exactly when there are finitely many classes, and then the minimal DFA has one state per class. Its moves are easy: the class of x goes to the class of xc on c. It accepts in the classes whose words are in L.

Find classes builds it from words. Start with ε. Extend each class's word by each symbol, and compare the new word with the class words found so far. If one is equivalent, the new word joins that class. If a suffix tells it apart from all of them, it starts a new class. Stop when every class has a move on every symbol. [Three classes: words ending in ab](#example:ends-in-ab) finds ε, a and ab, and the triangle shows the suffix that tells each pair apart. [Show me](#play:ends-in-ab)

The classes don't care how the language was given. [A DFA with five states, a language with three classes](#example:extra-states) loads a DFA with two states too many, and the classes come out the same three. That is also why [DFA minimization](/dfa-minimization/) works: it finds the same classes, starting from the states of a DFA instead of from words. [Show me](#play:extra-states)

Some books draw every DFA complete, with a dead state for the words that can never get into L; others leave that state out and let missing moves reject. [The class that never gets back](#example:dead-class) shows the dead class of ab*. Switch **The dead class** in Options to draw it or leave it out. It is one class either way.

## A lower bound on states

Here is the part I use most. If you can find k words that are pairwise told apart, every DFA for L has at least k states. No DFA needed, no minimization, just k words and a suffix for each pair. Two of the k words in the same state would have to agree on every suffix, and they don't.

[Four words apart: at least four states](#example:apart-lower-bound) does it for words whose second symbol from the end is a: ε, a, aa and ab, six pairs, six suffixes. Four states is also enough, which Find classes confirms. Type your own words and press **Words apart** to try for more. [Show me](#play:apart-lower-bound)

## Infinitely many classes: no DFA

Now L = aⁿbⁿ. Take aⁱ and aʲ with i ≠ j. The suffix bⁱ gives aⁱbⁱ, which is in L, and aʲbⁱ, which is not. So ε, a, aa, aaa, ... are all told apart from each other: infinitely many classes. A DFA with k states would have to put two of ε, a, ..., aᵏ in the same state. No DFA accepts aⁿbⁿ. [aⁿbⁿ: infinitely many classes](#example:anbn-infinite) fills in the triangle. [Show me](#play:anbn-infinite)

Find classes on aⁿbⁿ just keeps going: ε, a, b, aa, ab, aaa, ... [The classes never close](#example:anbn-classes) stops after 6 only because the page does. [As many a's as b's](#example:equal-counts) falls to the same words and the same suffixes.

```check
Q: For L = aⁿbⁿ, which suffix tells aa from aaa apart?
- a
* bb
- bbb
= aabb is in L and aaabb is not. bbb would work too: aaabbb is in and aabbb is out. The proof uses bⁱ for the shorter word.
```

The [pumping lemma](/pumping-lemma/) proves the same kind of thing, and both are worth having. Myhill-Nerode is an if and only if: when it says a language is regular, it also hands you the minimal DFA. The pumping lemma only ever proves languages are not regular, and some non-regular languages pump anyway.

## When to use it

- To prove a DFA is minimal: find as many pairwise distinguishable words as it has states.
- To prove a language is not regular: find an infinite family of words, pairwise told apart. The trick is picking the family; aⁱ, or the prefixes of the words you care about, is usually the place to start.
- To get the minimal DFA without building any DFA first, from a description of the language.

It does not give you an algorithm for every language. For a regular language given as a DFA, the classes are computable, as this page does. For a language given some other way, say by a context-free grammar, whether it is regular is undecidable.

## Common mistakes

- **Using prefixes instead of suffixes.** The theorem appends z to the end of both words. What comes before doesn't matter; the machine has already read it.
- **Thinking equivalent means equal.** a and ba are different words in the same class.
- **Forgetting ε as a suffix.** ε tells apart a word in L from a word not in L. It is often the first suffix to try.
- **Finding k distinguishable words and claiming exactly k states.** k words apart prove at least k states. You need to show the classes stop at k for exactly.
- **Picking a family that is not pairwise apart.** Every pair needs a suffix, not just neighbors.

## Try this

- [Three classes: words ending in ab](#example:ends-in-ab): before you press Find classes, guess which class bab is in. Then press Words apart with `bab a ab`.
- Load `(a|b)*abb`. How many classes do you expect? Check with Find classes.
- [Four words apart](#example:apart-lower-bound): can you find five words that are pairwise apart? Why not?
- Load `equal`, then press Words apart with `eps a aa ab`. Which pair is equivalent?
- Load `a*b*`. Find three words that are pairwise apart, then check how many classes there are.
