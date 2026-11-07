# Regular expression to NFA

A regular expression is a short way to describe a set of words. `(a|b)*abb` is every word over a and b that ends in abb. An NFA is a machine that reads a word and says yes or no. Kleene showed in 1956 that the two describe exactly the same languages. Going from the expression to the machine is the easy direction. It is the first step in lex, and in regex libraries that promise linear time, such as RE2.

Ken Thompson wrote it up in 1968, for a text editor. His trick still works: build a tiny NFA for each piece of the expression, then glue the pieces together the way the expression says.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `build(R)` | Builds an NFA for R, one piece per symbol or operator | O(m) |
| `run(w)` | Runs the NFA on a word w, keeping the set of states it could be in | O(n·m) |

Here m is the length of the expression without parentheses (symbols and operators) and n is the length of the word.

Every expression is a symbol, ε (the empty word), ∅ (nothing at all), or one of three operations on smaller expressions: union `R|S`, concatenation `RS` and star `R*`. So we need an NFA for each of the three base cases, and a way to combine NFAs for each operation. That is all. The build works from the inside out: in `(a|b)*abb`, the a and the b come first, then `a|b`, then the star, then the concatenations. The cells over the drawing show which part each step builds. [Show me](#play:ends-in-abb)

## Thompson's construction

Every piece has one start state and one accept state. Nothing comes into the start and nothing leaves the accept, until a parent adds arrows. That makes the pieces easy to glue.

- **A symbol a:** two new states and an arrow labeled a. ε gets an ε-arrow. ∅ gets two states and no arrow, so nothing is accepted.
- **Concatenation RS:** an ε-arrow from the accept state of R to the start of S.
- **Union R|S:** a new start with ε-arrows into both pieces, and a new accept state that both pieces reach.
- **Star R\*:** a new start and a new accept state. One ε-arrow skips R (that is the empty word), and one goes from the end of R back to its start (that is "again").

Count the states. Every symbol and every operator adds exactly 2, and concatenation adds none. `(a|b)*abb` has m = 7 (five symbols, `|` and `*`), so its NFA has 14 states. No state has more than 2 arrows leaving it, so there are at most twice as many arrows as states. Linear in the length of the expression, always. [The NFA grows in step with the expression](#example:linear-size)

The shorthands are built from the same parts. `R+` (one or more) is a star with no skip arrow. `R?` is a star with no arrow back: skip R, or read it once. [Show me](#play:plus-and-optional)

The drawing keeps the textbook picture: concatenation left to right, the two branches of a union stacked, the repeat arrow of a star above it and the skip arrow below. A piece built early stays where it is while the rest of the NFA grows around it. On a phone the pieces wrap onto rows, or turn to read top to bottom.

```check
Q: How many states does Thompson's construction build for `(ab|c)*`?
- 6
- 8
* 10
- 12
= Five symbols and operators (a, b, c, | and *), two states each. The concatenation ab only adds an ε-arrow.
```

## Sipser's construction

Sipser (Theorem 1.54 in his book) builds the same languages with fewer states. His pieces have one start but any number of accept states.

- **A symbol:** two states, the second accepts. **ε** is a single state that accepts. **∅** is a single state that does not.
- **Union:** one new start with ε-arrows to both starts. All the accept states stay.
- **Concatenation:** ε-arrows from every accept state of R to the start of S. Only S's accept states still accept.
- **Star:** a new start that accepts (for the empty word), an ε-arrow from it into R, and ε-arrows from every accept state of R back to R's start.

`(a|b)*abb` comes out with 12 states instead of 14. [Sipser's construction](#example:sipser-abb)

Why a new start for the star, and not just make the old start accept? Because arrows can come back into the old start, and then a word that stops halfway through would be accepted. Sipser has an exercise on exactly this.

The catch is the arrows. A star sends an arrow back from every accept state of its body, and keeps them all as accept states. Nest the stars and the arrows pile up. [Stars inside stars](#example:sipser-stars) has 7 states and 12 arrows. Thompson's construction pays 2 states and 4 arrows per star, no matter what is inside.

The **Construction** option switches between the two. Same expression, same words accepted, different picture.

## Running the NFA

An NFA can be in several states at once, so we keep a set S of them.

1. Start with S = {q0}, then add every state the ε-arrows reach. That is the ε-closure.
2. For each symbol c of the word, follow every c-arrow out of S, all at once. Then take the ε-closure again.
3. If S is ever empty, every path has died: reject. At the end, accept if S has an accept state.

Each symbol costs at most O(m), because S never holds more than the NFA's 2m or so states, and each has at most 2 arrows. So a word of length n costs O(n·m). Nothing backtracks. [Show me](#play:star-then-star)

This is the part that matters in practice. Most regex libraries (Perl, Python's `re`, Java) try one path at a time and back up when it fails. On `(a|a)*b` against thirty a's with no b, that is about a billion paths. The set simulation does thirty steps.

```check
Q: Thompson's NFA for `a*` has a new start q0, the piece for a (q1 to q2), and a new accept state q3. Which states are in S before the first symbol is read?
- q0 only
- q0 and q1
* q0, q1 and q3
- All four
= ε-arrows lead from q0 to q1 (into the a piece) and to q3 (the skip). q2 is only reached by reading an a. Since q3 accepts, a* accepts the empty word.
```

## Union written as +

Some books (Hopcroft and Ullman among them) write union as `+`, so `0+1` means "0 or 1". Then there is no one-or-more operator; write `aa*` instead. The **Union is written** option reads `+` as union, and the pseudocode follows it. [+ for union](#example:plus-for-union)

## When to use it

Use it whenever you need to match a regular expression and want a guarantee. lex and flex, and libraries such as RE2 and Go's `regexp`, all start this way. The NFA is small, and simulating it is O(n·m) for any expression and any word.

If you will run the same expression on many words, turn the NFA into a DFA first (the subset construction). A DFA reads each symbol in O(1), with no sets. The price is size: for "the fifth symbol from the end is a" the NFA has 34 states and the DFA needs 32 just to remember the last five symbols. Add one more `(a|b)` and the NFA grows by 6 states while the DFA doubles. Lexers usually pay it, since their expressions are fixed.

Don't use it for backreferences, such as `(a*)b\1` (the same a's twice). That language is not regular, and no NFA can match it.

## Common mistakes

- Forgetting the ε-closure before the first symbol. The start state's closure is where the run begins.
- Taking the ε-closure once at the start and never again. It is needed after every symbol.
- Making the old start of R an accept state for R\* instead of adding a new start. If the NFA for a\*b has an a-loop on its start state, `(a*b)*` would then accept a, which does not end in b.
- Precedence: `ab*` is a(b\*), not (ab)\*, and `a|bc` is a|(bc). Star binds tightest, then concatenation, then union.
- Reading `a+b` with the wrong convention. Check which book you are in.
- Confusing ε with ∅. `ε` matches the empty word. `∅` matches nothing, and `a∅` matches nothing either. [ε and ∅](#example:eps-and-empty)

## Try this

- [Words that end in abb](#example:ends-in-abb). Before each step, look at the highlighted cells and predict which arrows the step adds.
- [A star inside a star](#example:nested-stars). Find the inner loop and the outer loop. Which ε-arrows does the run follow after each b?
- [a\* then b\*](#example:star-then-star). Why does aba fail? Look for an arrow from the b's back to the a's.
- [The NFA grows in step with the expression](#example:linear-size). Write down the states after each build and check 2m.
- [Sipser's construction](#example:sipser-abb), then switch **Construction** to Thompson's and run the same word. Count the states in each.
- Type `(a|b)*a(a|b)` and press **Build**, then type `abb` and press **Run**. Watch the size of S at each step.
