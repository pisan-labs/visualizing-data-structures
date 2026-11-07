# Regex engines: backtracking vs NFA

Type `(a|a)*b` into a regex tester and match it against thirty a's. Python's `re` will think about it for a while. A long while. Grep answers right away. Same expression, same word, same answer: no match. The difference is the engine.

There are two ways to run a regular expression. A **backtracking** engine (Perl, Python's `re`, Java, JavaScript) tries one way to match at a time and backs up when it fails. An **NFA simulation** (Ken Thompson's 1968 method, used by RE2, grep and Go's `regexp`) follows every way at once. This page runs both on the same NFA and counts their steps.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `match(R ; w)` | Runs the backtracker on w, then the simulation, and compares their steps | backtracking O(2ⁿ) worst, simulation O(m·n) |
| `grow(R ; u)` | Runs both on u, uu, uuu, … and charts the steps | one match per n |
| `load(R)` | Builds the NFA for R by Thompson's construction | O(m) |

Here m is the number of symbols and operators in R and n is the length of the word. Thompson's NFA has 2m states.

Both engines count a step the same way: one visit to one state at one position in the word. That makes the counts comparable. The simulation visits each (state, position) pair at most once, so it never takes more than 2m(n + 1) steps. The backtracker can visit the same pair again and again, once for every path that leads there. That is the whole story, really. The rest of the page is details. [Show me](#play:every-path-tried)

## Backtracking, one path at a time

The backtracker walks the NFA like a maze. It keeps a position in the word and a **stack of choices**.

1. Start at q0 with nothing read and an empty stack.
2. At a state with two ε-arrows, take the first and push the other, with the current position, on the stack. The stack panel shows each choice as (state, position).
3. Follow a single ε-arrow. Read a symbol if the arrow matches the next symbol.
4. At a dead end (the arrow wants b and the next symbol is a, or the word ran out), pop the latest choice and go on from there. That is a **backtrack**.
5. Reaching the accept state with the whole word read is a match. An empty stack means every path failed.

Which way goes first? A star tries to go in before skipping (greedy, as in Perl), and `a|b` tries a first. The **Backtracker tries first** option flips stars to lazy, like `*?` in Perl. Lazy changes how soon a match is found, never whether one is. On `a?a?a?aaa` against aaa, lazy matches on its first path in 12 steps; greedy reads an a for each `a?`, runs out of a's for the `aaa` and needs 66. [Trying the short way first](#example:lazy-order)

One more rule. In `(a*)*b`, the inner `a*` can match nothing, so the outer star could go round forever without reading anything. The backtracker refuses to follow an ε-arrow back to a state it has already passed at the same position. Real engines do something similar: an iteration that matches nothing ends the loop. [A loop that reads nothing](#example:empty-loop)

Nothing here is slow when the first path works. `(a|a)*b` against aaaab: the backtracker reads the a's, finds the b and accepts in 23 steps. The simulation carries up to 8 states along and takes 39. [A match on the first path](#example:early-match)

## The NFA simulation, every path at once

The simulation keeps the set S of every state the NFA could be in.

1. Start with S = the ε-closure of {q0}.
2. For each symbol, move every state in S along its arrows for that symbol, all at once, then take the ε-closure again.
3. Accept if the accept state is in S at the end.

Two paths that reach the same state at the same position are the same from then on, so the set keeps one copy. S never has more states than the NFA, and each state has at most 2 arrows out. So each symbol costs O(m) and the word costs O(m·n), whatever the expression. [The live set](#example:live-set)

The price: the simulation always carries every live state, even when one path would have done. That is why the backtracker wins on early matches. Only by a constant factor, though.

## When the backtracker explodes

Run `(a|a)*b` against a's with no b. Each a can be read by the left branch or the right one, so n a's give 2ⁿ paths, and they all fail at the end. The backtracker has to try every one before it can say no. Its steps go 20, 48, 104, 216, …, doubling with each a. At n = 13 it passes the page's cap of 100,000 steps and stops. The simulation adds 8 steps per a. [Show me](#play:exponential-growth)

```check
Q: The backtracker takes 104 steps on (a|a)*b against aaa. About how many does it take against aaaa?
- 112
- 156
* 216
- 10,816
= Each extra a doubles the number of paths, and each path costs a few more steps. The page counts 216.
```

The pattern is an expression that can match the same text in more than one way, inside a repeat:

- **Nested repeats:** `(a+)+b`, `(a*)*b`. A run of a's can be cut into groups in 2ⁿ⁻¹ ways. [Nested repetition](#example:nested-plus)
- **Overlapping alternatives:** `(a|aa)*c`. The cuts into ones and twos follow the Fibonacci numbers, so the steps grow by about 1.6 per a. Slower than doubling. Still exponential. [Choices that overlap](#example:overlapping-choices)
- **Adjacent repeats:** `a*a*b`. Only n² splits, so this is polynomial, not exponential. That sounds fine until n is 20,000. [Two stars in a row](#example:two-stars)

Compare `a*b`: one way to read each a, about one backtrack per a, and the same count as the simulation. [One way to match](#example:no-blowup)

Russ Cox's 2007 article "Regular Expression Matching Can Be Simple And Fast" has the classic chart, for `a?ⁿaⁿ` against aⁿ: Perl took over a minute at n = 29, and Thompson's method a tiny fraction of a second. Our `a?a?a?aaa` is n = 3 of the same family.

## Catastrophic backtracking in practice

This has a name: ReDoS, regular expression denial of service. Send a server one carefully chosen string and it spends minutes on one regex.

On 20 July 2016, Stack Overflow went down for 34 minutes. A post had about 20,000 spaces in a row, and a regex that trimmed whitespace from the end of lines, `\s+$` in spirit, tried every starting point and scanned the spaces from each: about 200 million steps for one page. Quadratic, not exponential. It was enough.

On 2 July 2019, Cloudflare pushed a new firewall rule that contained `.*(?:.*=.*)`. Every CPU handling HTTP traffic across their network went to 100%, and sites behind Cloudflare served errors for about half an hour.

Neither expression looks dangerous. That is the problem.

## Rewriting a pattern

The fix is almost always to give each piece of text only one way to match.

- **Remove the duplicate:** `(a|a)*` is `a*`, and `(a+)+` is `a+`. Same language, one path.
- **Make alternatives disjoint:** `(a|aa)*` is `a*` too. In general, no two branches of a union inside a star should be able to start the same way.
- **Merge adjacent repeats:** `\s*.*\s*` can split the same spaces many ways; decide which part owns them.
- **Tell the engine not to back up:** possessive quantifiers (`a*+`) and atomic groups (`(?>...)`) in Java, PCRE and Python 3.11 and later throw away the choices inside the group once it has matched.
- **Bound the input:** a length limit or a match timeout (.NET has one) turns a hang into an error message.
- **Use a linear engine** when the pattern or the text comes from users: RE2, Go's `regexp`, Rust's `regex`, or .NET's `RegexOptions.NonBacktracking`.

```check
Q: Which pattern matches the same words as (a|a)*b but never backtracks more than once per a?
- (a|a)+b
* a*b
- (a*)*b
- (aa|a)*b
= a|a is just a, so (a|a)*b and a*b describe the same words. a*b has one way to read each a; the others still have many.
```

## When backtracking is still right

Most patterns have one way to match, and most matches are found early, so most of the time backtracking is fast and nobody notices. It is simple to write, needs little memory beyond the stack, and makes it easy to report what each group matched.

The real reason engines backtrack is **backreferences**: `(a*)b\1` means "some a's, a b, then the same a's again". That is not a regular language, so no NFA can match it, and the simulation has nothing to simulate. Lookahead and lookbehind push the same way. Backreferences make matching NP-hard: a 3-SAT formula can be turned into a pattern with backreferences that matches exactly when the formula can be satisfied. So no engine can promise polynomial time for them, unless P = NP.

This page sticks to formal regular expressions (union, concatenation, star, + and ?), as Sipser does, so there are no backreferences. Every expression here can be simulated in O(m·n).

## The input and the options

Type the expression, a semicolon and the word: `(a|a)*b ; aaaa`. A word on its own keeps the expression you have. `ε` (or `eps`) is the empty word. Words are up to 16 letters or digits; expressions use letters, digits, `|`, `*`, `+`, `?`, ε, ∅ and parentheses, up to 12 symbols and operators.

- **Match** runs the backtracker one visit at a time (each dead end is a step at the normal pace; choose finer detail to see every visit), then the simulation one symbol at a time, then compares. After 150 visits the page skips ahead, stopping each time the step count doubles.
- **Grow** with `(a|a)*b ; a` runs a, aa, aaa, … up to 16 symbols and charts both counts on a log scale. On a log scale, doubling is a straight line.
- **Load** (under More operations) builds the NFA without running anything.
- **Show step by step** picks which engine you watch. The other still runs, so the last step can compare them.

## Common mistakes

- Testing only words that match. The blowup happens on words that fail, after every path has been tried. [The empty word](#example:empty-word) fails cheaply; aaaaaaaaaaaaa does not.
- Thinking a short pattern is a safe pattern. `(a|a)*b` is seven characters.
- Expecting lazy quantifiers to fix it. On a failing word, lazy tries the same paths in a different order. Switch the option on [Every path, one at a time](#example:every-path-tried) and the count stays at 104.
- Thinking only exponential is dangerous. Quadratic took Stack Overflow down.
- Blaming the regular language. `(a|a)*b` and `a*b` are the same language. The engine is slow on one way of writing it.

## Try this

- [Doubling with every a](#example:exponential-growth). Read the chart: how many steps would n = 30 take?
- [Every path, one at a time](#example:every-path-tried). Before each backtrack, predict which choice comes off the stack.
- [A match on the first path](#example:early-match), then remove the b and run it again.
- [Choices that overlap](#example:overlapping-choices). Divide each count by the one before. What number do you get?
- Type `(ab|a)*c ; ababab` and press **Match**, then try `(a|ab)*c ; ababab`. Which one backtracks more, and why?
- Grow `a*a*a*b ; a`. Is it exponential? Look at the differences between counts.
