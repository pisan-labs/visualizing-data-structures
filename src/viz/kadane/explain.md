# Kadane's maximum subarray

Which stretch of an array has the largest sum? With only positive values the answer is the whole array, which is boring. Negative values make it a real question: a stretch might be worth extending through a dip to reach the good part on the other side, or it might not. Trying every start and every end works, n(n + 1)/2 sums. Kadane's algorithm (named after Jay Kadane) does it in one pass, and the idea fits in one line: at each value, extend the run you have or restart here.

A subarray means one or more values in a row, A[i..j] with both ends included.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| max subarray, extend or restart | one pass, keeping the best run ending here | Θ(n) |
| max subarray, every pair of ends | for each start, extend the end and keep the sum | Θ(n²) |
| extra space | run, best and three indices | O(1) |

Call `run` the best sum of a subarray that ends at the current value. At A[j] there are only two candidates: A[j] on its own, or the best run ending at A[j − 1] with A[j] added. The second is better exactly when that run is not negative. So:

1. if run < 0, restart: run = 0, and the run starts at j;
2. run = run + A[j];
3. if run > best, keep it, and where it starts and ends.

The answer is the best run anywhere, since the best subarray ends somewhere. [Show me](#play:extend-or-restart)

The **Approach** option switches to every pair of ends. Both give the same subarray. The variables count the work: `sums` is additions, `comparisons` is tests of two numbers, and `naive total` and `pattern total` say what each approach costs on this input.

## How it works

In [Extend or restart](#example:extend-or-restart), A = 3 −4 5 −2 −1 6 −7 2 1. The run row under A fills in left to right:

- 3, then 3 − 4 = −1. Negative, so at the 5 the run restarts: 5.
- 5 − 2 = 3 and 3 − 1 = 2. The dip costs 3, but the run stays positive, so it keeps going.
- 2 + 6 = 8. Best so far: A[2..5] = 5 −2 −1 6.
- 8 − 7 = 1. Still not negative, so it carries on to 3 and 4. It never beats 8.

One restart, marked by the cut at A[2]. One pass: 9 sums and 18 comparisons.

The −7 is the interesting one. After it the run is 1, which is small but positive. A run worth 1 still helps whatever comes next, so the pass keeps it. Only a negative run gets dropped.

```check
Q: A = 4 −5 3 2. After A[1] the run is 4 − 5 = −1. What happens at A[2] = 3?
- Extend: run = −1 + 3 = 2
* Restart: run = 3
- Nothing: 3 is less than best = 4
= The run so far is negative, so it can only drag A[2] down. Restart at A[2]: run = 3, then 3 + 2 = 5 beats 4, and the answer is A[2..3] = 5.
```

## Every pair of ends

The naive way: for each start i, set sum to 0, then extend the end j one value at a time. [Every pair of ends](#example:every-pair) fills a triangle, row i holding the sums of A[i..j]. It finds the same A[2..5] = 8 with 45 sums and 45 comparisons, against 9 and 18. [Show me](#play:every-pair)

Look down any column of the triangle. Column j holds every subarray that ends at A[j], and its largest entry is exactly the pass's run[j]. Column 5 holds 7, 4, 8, 3, 5 and 6: the largest is 8, and the run row says 8. The pass computes the best of each column from the one before it, without filling the column in.

Is the pass always cheaper? It does 3n steps, every pair of ends does n(n + 1). At n = 2 they tie at 6; from n = 3 on the pass wins, and at n = 1,000 it is 3,000 steps against 1,001,000.

## Ties, and the subarray itself

Keeping the sum is not enough; you usually want to know where the subarray is. The pass keeps `start`, where the current run began, and copies it into `lo` whenever the run becomes the best. Two indices, no extra space.

When two subarrays have the same sum, which one do you get? [A run at exactly 0 keeps going](#example:tie-at-zero) has A = 2 −2 3 −1. After the −2 the run is 0: not negative, so it keeps going, and A[0..2] = 3 becomes the best. A[2] alone is also 3. This page restarts only on a negative run and replaces best only on a strictly larger one, so it reports the subarray that starts first. Restart on `run ≤ 0` instead and you get A[2]. Same sum, different answer; a test that checks the indices will notice.

## All negative, and the empty subarray

[Every value negative](#example:all-negative) has A = −3 −1 −4 −2 −5. Every run is negative, so the pass restarts at every value, and the answer is the largest single value: A[1] = −1. That is only right if best starts at −∞ (or at A[0]). Start it at 0 and the answer comes out 0 with no subarray behind it.

Some books allow the empty subarray, with sum 0; Bentley's *Programming Pearls* does. Then an all-negative array's answer really is 0. Turn on **Allow the empty subarray** and run [The empty subarray wins](#example:empty-allowed): best starts at 0, for the empty one, and nothing beats it. The loop does not change, only the first line. The default here is at least one value, as in CLRS.

```check
Q: A subarray must have at least one value. Every value of A is negative. What should best start at?
- 0
* −∞, or A[0]
- The smallest value of A
= Any real subarray has a negative sum, so a best of 0 is never beaten and the pass reports a subarray that does not exist. Start below every possible sum.
```

## It is dynamic programming

run[j] = max(A[j], run[j − 1] + A[j]) is a recurrence, and the pass fills a one-row table from left to right. What makes it O(n) is that each entry looks back at one earlier entry. In the [longest increasing subsequence](/dp-lis/), each entry looks back at every earlier one, which is where its O(n²) comes from.

There is a second way to see it, through [prefix sums](/prefix-sum-hashmap/). The sum of A[i..j] is the running sum after j + 1 values minus the running sum after i values. To make that difference as large as possible for a fixed end, subtract the smallest running sum seen before it. Keeping the smallest running sum so far gives the same answer in one pass, and it is the same algorithm in disguise: the run restarts exactly when the running sum drops to a new low.

## Spot it

Reach for this pattern when the problem says:

- **largest, most, best, highest** total: an optimum, not a target;
- **stretch, consecutive, contiguous, in a row, subarray**: values next to each other, not any subset;
- **gains and losses, up or down, points and penalties**: negative values, or it would be the whole array.

Three problems of our own:

- A runner logs how many seconds each kilometre was ahead of or behind target pace. Which stretch of consecutive kilometres gained the most time?
- A stock's daily change in cents for a year. What is the most you could have made by holding it over one unbroken stretch of days?
- Each block of a street has a noise score from −9 to 9. Pick the run of consecutive blocks with the highest total score. If every block scores below 0, pick the single best block.

Look-alikes that call for something else: "a total of exactly k" has a target, so count running sums with a hash map ([prefix sums with a hash map](/prefix-sum-hashmap/)). "The best 7 consecutive days" has a fixed length, so slide a window ([sliding window](/sliding-window/)). "The largest product" is still this pass, but keep the smallest product ending here too, since a negative value swaps the two.

## When to use it

Use it for the best total of a stretch, in one pass and O(1) space, with any signs. It works on a stream, too: it never looks back.

Avoid it when the stretch has a fixed length (a sliding window is simpler), when there is an exact target (prefix sums), and when the array wraps around in a circle: then the best stretch might use both ends, and the plain pass misses it.

## Common mistakes

- Starting best at 0 when a subarray must have a value. Every all-negative array comes out wrong.
- Restarting after adding instead of before. Test whether the run so far is negative, then add A[j].
- Keeping only the sum. Save `start` with the run and copy it when the best changes, or you cannot say where the subarray is.
- Mixing up `<` and `≤`. The sum is the same either way, but the subarray you report changes, and so do the expected answers in tests.
- Checking `run > best` before adding A[j]. The run that ends at the last value is never checked.
- Thinking a dip ends the run. [Extend or restart](#example:extend-or-restart) crosses −2 and −1 to reach 8. Only a run below 0 is dropped.

## Try this

- [Extend or restart](#example:extend-or-restart): before you run it, guess where the cut goes.
- Load `5 -6 5`, then `5 -4 5`. When is the dip worth crossing?
- [All positive: the whole array](#example:all-positive): the run never restarts. What would make it?
- [Every value negative](#example:all-negative), then turn on **Allow the empty subarray** and run it again.
- Press Compare, pick this page with other options, and set one side to every pair of ends. Fill it with 12 random values and watch `sums` on both sides.
