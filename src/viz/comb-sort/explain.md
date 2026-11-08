# Comb sort

Bubble sort has an animal problem. Big values near the front, the rabbits, race to the end: one pass carries them all the way. Small values near the end, the turtles, crawl: one slot left per pass. A single turtle in the last slot keeps bubble sort busy for n - 1 passes. Comb sort's fix is simple. Compare values far apart first, so turtles can jump.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts A in place | O(n log n) best, O(n²) worst, close to n log n on random input |

Pick a gap. Walk i along the array and compare `A[i]` with `A[i + gap]`; swap them if they are out of order. That is one pass. Then shrink the gap, divided by 1.3 and rounded down, and make another pass. Once the gap is 1, each pass is a pass of bubble sort, and the sort stops after a gap-1 pass with no swaps.

With n = 12 the gaps are 9, 6, 4, 3, 2, 1, 1, ... [Gaps of 9, 6, 4, 3, 2, 1](#example:shrinking-gap). The pointers i and i+gap show which pair is being compared. [Show me](#play:shrinking-gap)

## Turtles

In [Two turtles](#example:turtle), 3 and 5 sit at the end of 16 values. Bubble sort moves them one slot per pass: 15 passes, 120 comparisons. Comb sort's first gap is 12, so 3 jumps 12 slots left in a single swap. 8 passes, 90 comparisons. [Show me](#play:turtle)

Each long swap can fix many out-of-order pairs at once. Bubble sort only ever fixes one pair per swap, so it needs exactly as many swaps as there are inversions: 45 for [ten values in reverse](#example:reverse). Comb sort needs 7.

```check
Q: A = 20 30 40 50 60 70 80 10. Why is this slow for bubble sort?
- 80 has to move to the end
* 10 can move only one slot left per pass
- The values are almost sorted, which is the worst case
- There are too many equal values
= 10 is a turtle. Bubble sort moves it one slot per pass, so it takes 7 passes to get home. A gap lets it jump.
```

## Why 1.3

Stephen Lacey and Richard Box tried lots of shrink factors on lots of random arrays (in Byte magazine, 1991) and 1.3 came out best. The **Shrink the gap by** option lets you try the alternatives.

- **2 is too fast.** It skips gaps the turtles needed, and gap-1 passes are left to do the work. Worse, for 16 values it gives gaps 8, 4 and 2, all even, so no pass ever compares an even slot with an odd one. [Shrink by 2](#example:halving) puts small values in the even slots and big ones in the odd slots: nothing moves until gap 1, then 11 passes and 154 comparisons. With 1.3 it is 8 passes and 90.
- **1.1 is too slow.** Each pass costs about n comparisons, and you make a lot of them.

This page works out the gap in whole numbers (gap × 10 / 13 for 1.3, gap × 10 / 11 for 1.1). Floating point can bite here. Dividing by 1.1 gives 33 / 1.1 = 29.999999999999996, which rounds down to 29, not 30. Argh.

```check
Q: n = 20. What are the first three gaps with shrink factor 1.3?
- 13, 10, 7
* 15, 11, 8
- 10, 5, 2
- 19, 18, 17
= floor(20 / 1.3) = 15, floor(15 / 1.3) = 11, floor(11 / 1.3) = 8. Then 6, 4, 3, 2, 1.
```

## The costs

Comb sort pays for every gap, even when there is nothing to do. [Sorted input](#example:sorted) makes no swaps, but comb sort cannot know that until it has run a pass for every gap down to 1: 5 passes and 24 comparisons for 8 values. Bubble sort with early exit makes 7 comparisons and stops. So the best case is O(n log n), worse than bubble sort's O(n).

The worst case is still O(n²), and nobody has a tidy formula for the average. In practice it behaves like n log n on random data. It sorts in place with O(1) extra space.

It is not stable. A long swap can carry a value past an equal one. In [Long swaps jump over equal values](#example:unstable), the first pass swaps the first 30 with the 20 at the end, and it lands behind the other 30.

## When to use it

Honestly? Rarely in real code. Use your language's sort. Comb sort is worth knowing because it is bubble sort plus one idea, and the idea is a good one: move things far first, then fix them up close. Shell sort does the same thing to insertion sort, and does it better.

If you need a tiny in-place sort with no recursion and no extra memory, and n is a few thousand, comb sort is a reasonable choice. Heap sort is a better one.

## Common mistakes

- Stopping when the gap reaches 1. The first gap-1 pass is not always the last; keep going until one makes no swap.
- Letting the gap reach 0 (floor(1 / 1.3) = 0). Clamp it at 1.
- Dividing in floating point and getting a different gap than you expected.
- Claiming it is stable. It is not.

## Try this

- [Two turtles](#example:turtle). Watch how far 3 moves in its first swap.
- [Shrink by 2](#example:halving), then switch **Shrink the gap by** back to 1.3 and run it again.
- [Sorted input](#example:sorted): count the passes that do nothing.
- Load the preset **Turtles: small values at the end** at size 20 and compare the end of the run with what it says about bubble sort.
- Set **Detail** to Every detail to see every comparison, including the pairs that are already in order.
