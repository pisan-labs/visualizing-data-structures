# Monotonic stack

For each value in an array, what is the first bigger value to its right? The obvious way scans right from every value, up to n(n − 1)/2 comparisons. A monotonic stack answers all of them in one pass. The stack holds the values still waiting for an answer, and it stays in order: decreasing from bottom to top. When a new value arrives, every smaller value on top has just found its answer, so they are popped. Then the new value waits its turn.

It is the same stack as on the [stack page](/stack-array/). The only new rule is what gets popped.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `nextGreater(A)` | For each value, the first bigger value to its right | O(n) |
| `previousSmaller(A)` | For each value, the nearest smaller value to its left | O(n) |
| `largestRectangle(H)` | The largest rectangle under a row of bars | O(n) |

The stack holds indices, not values, so a pop knows where to write its answer. In the drawing it is the row of boxes at the bottom, bottom on the left, with each index under its box. The same values are outlined in the array, so you can see the staircase they form. The answers row fills in as values are popped. [Show me](#play:next-greater)

## Why the stack stays in order

Say the stack holds 7, 3, 2 and 5 arrives. 2 and 3 are smaller, so 5 is their answer: pop them. 7 is bigger, so it keeps waiting, and so does everything under it. Push 5. The stack is now 7, 5, still decreasing.

Why is it safe to forget 2 and 3? They are answered. And they can never be anyone else's answer either: any later value that 2 or 3 would beat, 5 beats first, and 5 is closer. So a value waits on the stack exactly as long as it might still matter.

```check
Q: A = 6 2 4 1 5. When the scan reaches 5, how many indices does it pop?
- 1
* 2
- 3
- 4
= The stack holds 6, 4, 1 by then (4 already popped 2). 5 pops 1 and 4, and stops at 6.
```

## Why it is linear

One value can pop a lot at once. Doesn't that make it quadratic? No. Every index is pushed exactly once and popped at most once, so over the whole scan there are at most n pops. A loop inside a loop, and still O(n). It is the same kind of argument as [amortized analysis](/amortized-analysis/): count the total, not the worst single step.

The two extremes show it. On [decreasing values](#example:all-waiting) nobody is ever popped: the stack fills up and every answer is none. On [increasing values](#example:answered-at-once) each value is popped by the very next one, and the stack never holds more than one index.

## The variants

There are four questions (next or previous, greater or smaller), and they are all the same loop. Flip the comparison and the stack's order flips with it. For the previous smaller value, keep the stack increasing: a new value pops everything that is not smaller than it, and whatever is left on top is its answer. Switch **Scan for** in the options to see it. [Previous smaller value](#example:previous-smaller)

Ties need care. For the next *greater* value, an equal value is not an answer, so pop only on `<`. Use `≤` and equal values answer each other.

## The largest rectangle in a histogram

Here is where the stack earns its keep. Each bar is 1 wide; find the largest rectangle under the bars. Every rectangle has a lowest bar, so ask, for each bar: how wide can a rectangle of exactly this height go? Left until the first lower bar, right until the first lower bar. That is a previous-smaller and a next-smaller question at once, and one increasing stack answers both.

When bar i is lower than the bar on top, the top's rectangle cannot reach i. Pop it. The bar now under it on the stack is lower, so the rectangle starts just after that and ends at i − 1. Measure it. A bar of height 0 after the end pops everything still waiting. [The largest rectangle in a histogram](#example:histogram) finds 5 × 2 = 10. [A staircase](#example:staircase) never pops until the end, and then pops all five. [Show me](#play:histogram)

```check
Q: Bars 3 1 3 3. What is the largest rectangle?
- 4
- 9
* 6
- 3
= Height 3 over the last two bars: 3 × 2 = 6. Height 1 reaches all four bars, but 1 × 4 = 4.
```

## When to use it

Use it when each element needs the nearest element on one side that is bigger or smaller: stock spans (how many days since the price was this high), daily temperatures (days until a warmer one), the largest rectangle, the visible buildings in a skyline. If a brute force solution scans outward from every element until something bigger or smaller shows up, a monotonic stack probably does it in O(n).

It answers "nearest bigger", not "biggest in a range". For the maximum of every window of k values, use a [monotonic queue](/monotonic-queue/), which can also drop values that fall out of the window. For arbitrary ranges, a [segment tree](/segment-tree/).

## Common mistakes

- Storing values on the stack instead of indices. Then the pop does not know where to write the answer, and the histogram cannot measure a width.
- Getting ties wrong: `<` against `≤` decides whether equal values answer each other.
- Forgetting what is left on the stack at the end. Those values have no answer (or, in the histogram, still need measuring: hence the height-0 bar).
- In the histogram, measuring the width from the popped index instead of from the bar under it on the stack. The rectangle reaches left past bars that were popped earlier, because they were higher.

## Try this

- Load 5 4 3 2 1 6 and press **Scan with the stack**. Before 6 arrives, what is on the stack? How many does 6 pop?
- Load 2 2 2 2 and scan. Then switch **Scan for** to the previous smaller value and scan again.
- Load 2 1 5 6 2 3, press **Largest rectangle**, and predict each bar's area before it is popped.
- Load 3 3 3 3 and press **Largest rectangle**. Which pop measures the 12?
