# Ternary search

If cutting the array in half is good, cutting it in thirds must be better. That is the obvious next thought after binary search, and it turns out to be wrong, at least for sorted arrays. Ternary search is still worth knowing, because it does something binary search cannot: it finds the top of a hill.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `search(x)` | Returns an index of x in sorted A, or -1 | O(log n): about log₃ n rounds, up to 4 comparisons each |
| `max()` | Returns the index of the peak of A, which rises and then falls | O(log n): about log₁.₅ n rounds, 1 comparison each |

Both keep a window `A[lo..hi]` and look at two points in it, a third and two thirds of the way across:

`third = floor((hi - lo) / 3); m1 = lo + third; m2 = hi - third`

The two points cut the window into three parts. Each round throws away at least one of them.

## Searching a sorted array

Compare x with `A[m1]` and `A[m2]`. If either is x, done. If x is smaller than `A[m1]`, keep the left third. If x is bigger than `A[m2]`, keep the right third. Otherwise x is between them: keep the middle. In [Two points, three thirds](#example:thirds), 58 takes the middle third, then the right third, and then one value is left. [Show me](#play:thirds)

## Why it loses to binary search

Fewer rounds, yes. log₃ n is about 0.63 log₂ n, so a million values take about 13 rounds instead of 20. But count the comparisons. A round of binary search asks at most two questions (is it x? is it bigger?). A round of ternary search asks up to four (is it `A[m1]`? is it `A[m2]`? smaller than `A[m1]`? bigger than `A[m2]`?). Four comparisons per log₃ n rounds is about 4 × 0.63 ≈ 2.5 per halving, against binary search's 2.

[Fewer rounds, more comparisons](#example:more-comparisons) looks for 20, which is not there: 3 rounds and 10 comparisons. Binary search takes 4 rounds and 8 comparisons. The counters on the right keep score, and the last step says what binary search would have done. [Show me](#play:more-comparisons)

Splitting into k parts makes it worse the bigger k gets. Two is the sweet spot. (Hmmm, unless reading a value is far more expensive than comparing it. Then fewer rounds can win: that is the idea behind B-trees.)

```check
Q: On a sorted array, why does ternary search usually make more comparisons than binary search?
- It looks at every value in the window
* Each round can make four comparisons, and it saves fewer rounds than that costs
- It has to sort the array first
- Thirds round down badly
= log₃ n rounds of up to 4 comparisons is about 2.5 log₂ n comparisons. Binary search makes at most 2 log₂ n.
```

## Finding a peak

Now take values that rise and then fall, a hill. There is no x to compare with, so binary search has nothing to go on. Ternary search compares the two points with each other.

- If `A[m1] < A[m2]`, the values are still climbing somewhere between them, so the peak cannot be at or left of m1. Drop `A[lo..m1]`.
- Otherwise they are falling, so the peak cannot be at or right of m2. Drop `A[m2..hi]`.

When one value is left, it is the peak. In [The peak of values that rise, then fall](#example:peak), 14 values take 5 rounds of one comparison each. [Show me](#play:peak)

A sorted array is a hill too, with the peak at the end: [Only rising](#example:peak-at-end). Set **What to find** to the maximum to start with a hill and get hill presets.

This version is where ternary search earns its keep. The same idea works on a function instead of an array: to find the maximum of f on an interval, compare f at two points and drop a third. People use it for "find the best speed", "find the angle that throws the ball furthest" and plenty of contest problems.

```check
Q: Find max compares A[m1] = 40 with A[m2] = 25. What can it drop?
- Everything left of m1
* Everything from m2 to hi
- Nothing; it needs another comparison
- The middle third
= The values fall from m1 to m2, so the peak is left of m2. Anything at or past m2 is lower than A[m1] and cannot be the peak.
```

## When it fails

The peak version needs exactly one hill with no flat stretches.

- **Two hills.** Comparing two points tells you which way is up locally, nothing about a bigger hill somewhere else. [Two peaks](#example:two-peaks) has a hill of 40 and a hill of 80. The page refuses it.
- **Flat stretches.** If `A[m1] = A[m2]` on a plateau, you cannot tell which side the peak is on. The page refuses neighbors that are equal.

## Common mistakes

- Using it instead of binary search on sorted arrays because "three is more than two".
- Forgetting the middle case in `search`: x between `A[m1]` and `A[m2]` keeps `A[m1 + 1 .. m2 - 1]`.
- In the peak version, writing `lo = m1` instead of `lo = m1 + 1`. With a window of two values, m1 = lo, and the window stops shrinking.
- Running the peak version on values with two hills and trusting the answer.

## Try this

- [Two points, three thirds](#example:thirds). Before each round, say which third stays.
- [Fewer rounds, more comparisons](#example:more-comparisons). Then search for a few other values and compare the counts with binary search's.
- [Found on a first point](#example:first-point): the best case.
- [The peak](#example:peak). Then load the preset **A hill: rises, then falls** at size 20 and count the rounds.
- [Two peaks](#example:two-peaks). Change one value so it becomes a single hill.
