# Big-O growth lab

Big-O answers one question: what happens to the work when the input gets bigger? Not how many seconds a program takes on your laptop today, but how the step count *grows* with n. Double the input. Does the work stay the same, double, quadruple, or explode?

Each bar here counts the steps of a small loop. Change n and watch which bars run away.

## The usual suspects

| Growth | A loop that does it | n = 1,000 | Doubling n |
|---|---|---|---|
| 1 | one step, no loop | 1 | stays the same |
| log n | halve n until it is 1 | 9 | adds 1 |
| n | one step per item | 1,000 | doubles |
| n log n | halve n once per item | 9,000 | a bit more than doubles |
| n² | one step per pair of items | 1,000,000 | four times |
| 2ⁿ | two calls, each one smaller | about 10^301 | squares |
| n! | n calls, each one smaller | about 10^2567 | much worse |

Here `log n` counts halvings, ⌊log₂ n⌋, which is why log 1000 is 9 and not 9.97. Big-O does not care about the base of the log: changing base only multiplies by a constant.

## Doubling n

The doubling test is the most useful habit in this page. Set n, press **Double n**, and read the growth row at the top of each bar. A linear loop goes ×2. A quadratic one goes ×4. log n barely moves, and 2ⁿ squares itself. [Show me](#play:doubling-n)

It works backwards too. If your program takes 1 second on 10,000 items and 4 seconds on 20,000, it is probably quadratic, and 1,000,000 items will take about 3 hours. Time it at two sizes and you have a prediction.

```check
Q: A program takes 2 seconds on 1,000 items and 8 seconds on 2,000. What growth does that suggest?
- n
- n log n
* n²
- 2ⁿ
= Doubling n made it four times slower, which is what n² does.
```

## Why constants don't matter (eventually)

Big-O drops constant factors and smaller terms: 3n² + 100n + 7 is O(n²). That feels like cheating. Why throw away the 100n? Because for large n the n² term wins by so much that nothing else shows. Set n to 1,000,000 with n and n² showing. n takes a millisecond at a billion steps a second; n² takes 17 minutes. [The quadratic wall](#example:quadratic-wall)

But "eventually" is doing a lot of work. For small n, the curves trade places: n² is bigger than 2ⁿ at n = 3, and the two are equal at 2 and 4. If your input is always 5 items, Big-O is not the thing to worry about. [Small n can fool you](#example:small-n-crossover)

## Exponential and factorial

Add one item and 2ⁿ doubles. That sounds mild until you do it 60 times. Trying every subset of 60 items, at a billion subsets a second, takes about 36 years. [Exponential explodes](#example:exponential-explodes)

n! is worse. It multiplies by n + 1 every time n goes up by one, and at n = 20 it is more than two trillion times 2ⁿ. Switch **Bar height** to the log scale to keep both in view. [Factorial beats exponential](#example:factorial)

No hardware fixes this. A computer a thousand times faster buys you about 10 more items for 2ⁿ, and fewer than that for n!.

```check
Q: Your 2ⁿ algorithm handles 30 items in a second. A new machine is 1,024 times faster. How many items does it handle in a second?
- 30,720
- 60
* 40
- 31
= 1,024 is 2¹⁰, so the faster machine buys exactly 10 more items.
```

## Reading the bars

On the linear scale the tallest bar fills the chart and the others shrink to match. That is honest: next to n², the linear bar really is a sliver. The log scale stacks powers of ten evenly, so every curve fits and they line up in the order they grow. [Every curve on a log scale](#example:log-scale)

The time row assumes a computer that does a billion simple steps a second. That is roughly right for a modern machine and simple steps. The **Computer speed** option slows it to a million a second, which is closer to a loop whose every step does real work.

## Common mistakes

- Counting nested loops as n² when the inner loop is not n long. `for i in range(n): for j in range(i)` is still O(n²), but `for i in range(n): halve until 1` is O(n log n).
- Thinking O(log n) needs a base. It doesn't; the base is a constant factor.
- Reading O as "exactly". O is an upper bound. Binary search is O(n) too, just not tightly. Θ says "this, up to constants".
- Ignoring the input that is actually coming. An O(n²) sort on 10 items beats an O(n log n) one with a big constant.
- Assuming a faster computer saves an exponential algorithm. Run the numbers.

## Try this

- [Constant and logarithmic](#example:constant-and-log). Go from 16 to a million. How much does log n grow?
- Set n to 10 and press **n + 1** a few times with 2ⁿ showing. Each press doubles it.
- Set n to 1,000,000 and switch **Computer speed** to a million steps a second. How long does n log n take now?
- Turn on every curve under **More operations**, set n to 20, and switch between the two scales.
