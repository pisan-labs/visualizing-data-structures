# Big-O, Ω and Θ by definition

The growth lab shows that n² runs away from n. This page asks the question a proof has to answer: what exactly does f(n) = O(g(n)) claim, and how would you show it?

The definition, in the form CLRS uses:

f(n) = O(g(n)) when there are constants c > 0 and n₀ such that 0 ≤ f(n) ≤ c·g(n) for every n ≥ n₀.

Two numbers and a promise. c scales g up until it sits above f. n₀ says where the promise starts. The pair (c, n₀) is a **witness**: find one and you have a proof. Here both are things you can move, and the page shows every n where your witness breaks.

## Reading the chart

f(n) is the blue curve and c·g(n) the orange one. The dashed line is n₀. The gray band covers the n before n₀, which the definition ignores. A red band marks an n ≥ n₀ where the inequality fails. Under the axis, the **check** strip has one cell per n: gray before n₀, green where the inequality holds, red where it fails.

The second chart divides: f(n)/g(n). Wherever g(n) > 0, f(n) ≤ c·g(n) is the same as f(n)/g(n) ≤ c, so the witness works when the ratio stays under the line at c. Same check, one curve instead of two.

Values are exact. log n here is ⌊log₂ n⌋, the number of halvings, as on the growth lab, so every value is a whole number or a fraction and no rounding decides a check.

## Try a witness, find n₀

Take f(n) = 3n² + 10n + 5 and g(n) = n². Type `3 1` and press **Try c, n₀**. Every n breaks it: f is 3n² plus something positive, so it is always above 3n². Now try `18 1`. It holds from n = 1, because 3n² + 10n + 5 ≤ 3n² + 10n² + 5n² = 18n². Then type `4` and press **Find n₀ for c**: the page walks down from the end of the range and stops at the last n that breaks it. For c = 4 that is n = 10, so n₀ = 11. [Show me](#play:bigger-c)

Both witnesses prove the same thing. c = 18 is not cheating, and c = 4 is not more correct. The definition asks for some c and some n₀, not the smallest ones.

What does it cost? **Try c, n₀** compares f(n) with c·g(n) once per n, from n₀ until something breaks, so at most N − n₀ + 1 comparisons. **Find n₀** walks down from N and stops at the first n that breaks it, so it is O(1) when n = N already fails and Θ(N) when nothing does.

n₀ can be large. 100n is above n² for every n below 100, and 100n = O(n²) anyway: c = 1 works from n₀ = 100, and c = 0.5 from n₀ = 200. [n₀ can be large](#example:late-n0)

```check
Q: 100n is bigger than n² for every n below 100. Is 100n = O(n²)?
- No: f has to stay under g
* Yes: c = 1 and n₀ = 100 are a witness
- Only with c of at least 100
= The definition ignores every n before n₀, and n₀ can be any fixed number. (c = 100 and n₀ = 1 work too.)
```

## Ω and Θ

Ω flips the inequality: f(n) = Ω(g(n)) when 0 ≤ c·g(n) ≤ f(n) for every n ≥ n₀. It is a lower bound. Set **Relation** to Ω and the check asks f to stay above c·g. n log n = Ω(n): with c = 1, log n ≥ 1 from n = 2 on. log 1 = 0, so n = 1 always breaks it. [Ω flips the inequality](#example:omega-flips)

Θ asks for both at once, with two constants: c₁·g(n) ≤ f(n) ≤ c₂·g(n) for every n ≥ n₀. f is sandwiched between two copies of g. CLRS's example is n²/2 − 3n = Θ(n²), with c₁ = 1/14, c₂ = 1/2 and n₀ = 7. Type `1/14 1/2 7`. Then try n₀ = 1: f(n) is negative until n = 6, and the 0 ≤ in the definition rules those n out. [Θ sandwiches f](#example:theta-sandwich)

Books differ in small ways. CLRS writes 0 ≤ into each definition. Others assume f and g are positive and leave it out, which only changes anything for a function that dips below 0. Some write f(n) ∈ O(g(n)), since O(g(n)) is a set of functions; the = is a habit, and it only reads left to right. Knuth's Ω is the one here; an older use of Ω (Hardy and Littlewood's) means "not o" and turns up in number theory, not in algorithms courses.

## What a finite check cannot tell you

The page checks n = 1 to N, where N is the **n checked** option. "For every n ≥ n₀" is infinitely many n. No loop gets there.

Take f(n) = 2ⁿ and g(n) = n¹⁰. n¹⁰ is bigger from n = 2 all the way to 58, so c = 1 and n₀ = 2 pass every n up to 50. At n = 59, 2ⁿ passes n¹⁰ and stays ahead for good. [A finite check can be fooled](#example:finite-check)

n² against n does the same thing more quietly. c = 100 holds for every n up to 50 and breaks at n = 101. In fact every c breaks at n = ⌊c⌋ + 1, so no c works and n² is not O(n). [When no c works](#example:no-c-works)

So when your witness passes the range, the page says what happens after it. For the pairs in the menu (the **Start over with** list), the algebra is worked out by hand: each one comes with a reason the inequality, once settled, stays settled, and the page uses it with a little more exact arithmetic to say "proved" or "it first breaks at n = 59". For functions you type yourself, the page reads the limit of f/g off the biggest terms. That tells you whether the inequality holds for every large n, but not whether it holds from your n₀, and the page says so.

## The limit test

Press **Limit of f/g** and the page works out f(n)/g(n) at n = 1, 2, 4, 8 and so on, then names where it goes.

- The limit is 0: f grows more slowly, f = o(g). So f = O(g) but not Ω(g).
- The limit is a positive constant L: f = Θ(g). Any c₂ above L and c₁ below it work from some n₀ on.
- The limit is ∞: f = ω(g). So f = Ω(g) but no c is big enough for O.

For 3n² + 10n + 5 against n², the ratio is 3 + 10/n + 5/n², which settles to 3. For 100n against n² it is 100/n, heading to 0. For n log n against n it is log n, slow but unbounded. [The limit test](#example:limit-test)

```check
Q: f(n) = 3n² + 10n + 5 and g(n) = n². Where does f(n)/g(n) go, and what does that say?
- To 0, so f = o(g)
* To 3, so f = Θ(g)
- To ∞, so f is not O(g)
- To 18, so c must be 18
= f/g = 3 + 10/n + 5/n², which settles to 3. A positive constant means Θ. (18 is only the ratio at n = 1.)
```

The limit test is a shortcut, not the definition. It needs the limit to exist. A function that bounces, say n for even n and 1 for odd n, has no limit against n, yet it is still O(n) by the definition, with c = 1. When the ratio bounces, go back to c and n₀.

## When to use which

Use the definition when you need a proof, or when someone says "obviously". Writing down c and n₀ forces the "obviously" to be true. It is also the only tool when the limit does not exist.

Use the limit test for a quick comparison of two well-behaved functions, which is most of the time. Polynomials, logs, 2ⁿ and n! all have limits against each other.

Avoid using a plot, a table, or this page's range check as a proof. They are good at finding a witness that fails. They cannot show one that works.

## Common mistakes

- **Reading O as "exactly".** O is an upper bound. 100n = O(n²) is true, just loose. Θ means "the same growth, up to constants", and that is usually what people mean when they say O.
- **Thinking a bigger c is cheating.** Any c > 0 is allowed, and so is a big one. 3n² + 10n + 5 ≤ 18n² from n = 1 is a perfectly good proof.
- **Thinking n₀ has to be small.** n₀ = 100, or a million, is still a constant. 100n ≤ n² only from n = 100.
- **Reading O(n²) as "slow".** O(n²) is a bound on growth, not a speed. Merge sort is O(n²) too, since n log n ≤ n² for n ≥ 1. And for small n, an n² algorithm with a small constant can beat an n log n one.
- **Confusing worst case with O.** Worst case is a function: the most steps over all inputs of size n. O is a bound you put on a function. Insertion sort's best case is Θ(n) and its worst case is Θ(n²). "Insertion sort is O(n²)" is true of every case; "insertion sort is Ω(n²)" is only true of the worst and average cases.
- **Checking a range and calling it a proof.** 2ⁿ ≤ n¹⁰ for every n from 2 to 58.
- **Forgetting log 1 = 0.** With g(n) = n log n, g(1) = 0, and no c makes c · 0 bigger than f(1). n₀ has to start at 2. [log 1 = 0 pushes n₀ past 1](#example:log-starts-at-zero)

## Try this

- [A bigger c is not cheating](#example:bigger-c): find the smallest n₀ for c = 3.1. Is it in the range? Set **n checked** to 200 and try again.
- Switch **Relation** to Θ on 3n² + 10n + 5 against n² and find a sandwich that starts at n₀ = 1.
- [When no c works](#example:no-c-works): try c = 1000. Where does it break?
- Type `n^3 ; n^2 + 100n` and press **Compare f ; g**. How big does n get before n³ passes 1·(n² + 100n)?
- [A finite check can be fooled](#example:finite-check): set **n checked** to 100 and run it again.
- Pick 2ⁿ against n! from the list. Is c = 2 from n₀ = 1 a witness? Is c = 1 from n₀ = 4?
