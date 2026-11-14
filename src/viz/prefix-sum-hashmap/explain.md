# Prefix sums with a hash map

How many stretches of an array add up to exactly k? The obvious answer tries every start and every end. That is n(n + 1)/2 stretches, and on a million values it takes a while. There is a one-pass trick: keep a running sum, and remember every running sum you have seen in a hash map. Each step is one lookup. Negative values are fine, which is exactly where the other tricks for stretches break.

A subarray here means one or more values in a row, A[i..j] with both ends included.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| count, running sum and map | how many subarrays sum to k | O(n) expected |
| longest, running sum and map | the longest subarray with sum k | O(n) expected |
| count, every pair of ends | for each start, extend the end and keep the sum | Θ(n²) |
| extra space | the map holds each distinct running sum once | O(n) |

The pattern rests on one subtraction. Call A[0] + … + A[j − 1] the running sum after j values (these are the prefix sums of [range queries](/range-queries/), drawn the same way, on the fences between cells). The sum of A[i..j − 1] is the running sum after j values minus the running sum after i values. So a subarray ending here sums to k exactly when some earlier running sum equals sum − k. Counting them is one lookup in a map from running sum to how many times it has appeared. [Show me](#play:count-with-negatives)

The **Approach** option switches to the naive way: every pair of ends. Both give the same answer. The variables count the work: `sums` is additions, `lookups` is hash map reads and writes, and `naive total` and `pattern total` say what each approach costs on this input.

## How it works

Start with the empty prefix: running sum 0, seen once, so seen = {0: 1}. Then for each value:

1. add it to the running sum;
2. look up seen[sum − k] and add it to the count: each of those earlier running sums starts a subarray that ends here and sums to k;
3. record this running sum: seen[sum] goes up by 1.

In [Four subarrays sum to 3](#example:count-with-negatives), A = 2 3 −1 2 −4 1 2 −1. The running sums under the fences are 0 2 5 4 6 2 3 5 4. At A[6] the running sum is 5. 5 − 3 = 2, and 2 has been seen twice, after 1 value and after 5 values. So two subarrays end at A[6] and sum to 3: A[1..6] and A[5..6]. One lookup, two answers. The whole pass finds 4, with 8 sums and 16 lookups.

The map's entry for 0 at the start matters. It stands for "start at the very beginning". Without it, A[0..5], whose running sum is 3 = 0 + 3, is never counted.

```check
Q: A = 1 2 −1 3, so the running sums are 0 1 3 2 5. How many subarrays sum to 2?
- 1
- 2
* 3
- 4
= Look for pairs of running sums 2 apart, the later minus the earlier: 3 − 1 (A[1]), 2 − 0 (A[0..2]) and 5 − 3 (A[2..3]). Three.
```

## Every pair of ends

The naive way: for each start i, set sum to 0, then extend the end j one value at a time, adding A[j]. [Every pair of ends](#example:every-pair) fills a triangle, row i holding the sums of A[i..j]. It finds the same four subarrays with 36 sums. [Show me](#play:every-pair)

Adding up each subarray from scratch would be worse, Θ(n³). Extending the sum is already the smart part of the naive version.

Is the pattern always cheaper? Nope. It does n sums and 2n lookups, 3n steps. Every pair of ends does n(n + 1)/2. On 4 values that is 12 against 10, and the naive way wins. At n = 5 they tie, at 15 each. After that the pairs pull away: 36 against 24 at n = 8, and 500,500 against 3,000 at n = 1,000. Hash lookups also cost more than an addition in practice. Big-O is about what happens when n gets big, and it does get big.

## The longest: keep the first

Now find the longest subarray with sum k. Same pass, different map: first[s] is where the running sum s first appeared (after how many values). When sum − k is in the map, the longest subarray ending here starts at first[sum − k]. Record a running sum only the first time you see it, since an earlier start makes a longer subarray.

In [The longest keeps the first time](#example:longest-keeps-first) the answer is A[0..5], 6 values. The running sum is 2 after 1 value and again after 5, and first[2] stays 1. Later the running sum is 5 and needs 2, so the longest match ending at A[6] starts at A[1]: A[1..6], 6 values, a tie with the best. Overwrite first[2] with 5 and that match shrinks to A[5..6], 2 values.

[As many +1s as −1s](#example:balanced-run) is the classic disguise. Count a win as +1 and a loss as −1. A run with as many of each sums to 0, so look for two equal running sums, as far apart as possible. The running sum is 1 after the first game and again at the end: A[1..8], 8 games.

```check
Q: Looking for the longest subarray with sum k, the running sum is 4 after 2 values and 4 again after 7 values. What should first[4] be after the 7th value?
* 2
- 7
- 9
- Both 2 and 7
= Keep the first time. A subarray that starts after 2 values is longer than one that starts after 7, whatever it ends with.
```

## Why not a sliding window?

A [sliding window](/sliding-window/) also finds stretches in one pass, without a map. It grows on the right until the sum is too big, then shrinks from the left. That only works when the values are never negative: then growing can only raise the sum and shrinking can only lower it.

With negative values the window gives up on a start too early. [A window would give up too early](#example:window-gives-up) has A = 3 4 −4 2 and k = 5. The window reaches 3 + 4 = 7, too big, so it drops the 3. It never gets the 3 back, and misses A[0..3] = 5. The running sums don't care about signs: 5 − 5 = 0 was seen at the start, so A[0..3] is found.

When every value is positive, both work. The window needs O(1) extra space; the map needs O(n).

## Look up, then record

The order of steps 2 and 3 is not a detail. Record first, and the current running sum is already in the map when you look it up. For k = 0 that counts every position as a subarray of length 0.

[k = 0: equal running sums](#example:equal-running-sums) has A = 3 −3 2 −2 1 −1. The running sum is 0 four times, at the start and after 2, 4 and 6 values. Any two of them make a subarray that sums to 0: 4 choose 2 = 6. Record before looking up and the count comes out 12.

[Zeros: every subarray counts](#example:zeros-everywhere) is the other extreme. All 15 subarrays of five zeros sum to 0. seen[0] climbs 1, 2, 3, 4, 5 and the count adds each, 15 in all. The pass is still 5 sums and 10 lookups: counting is not listing.

## Spot it

Reach for this pattern when the problem says:

- **stretch, subarray, consecutive, contiguous**: a run of values in a row, not any subset;
- **exactly k** (or "balanced", "as many of each", "a multiple of m"): an exact target, so a difference of two running sums;
- **values can be negative**, or "gains and losses", "up or down": a sliding window will not do;
- **how many** (count with seen) or **longest** (keep first).

Three problems of our own:

- A list of daily deposits and withdrawals. On how many stretches of consecutive days does the balance change by exactly 100? (Count with k = 100.)
- A string of a's and b's. Find the longest stretch with as many a's as b's. (a = +1, b = −1, longest with k = 0.)
- A list of whole numbers. Count the stretches whose total is a multiple of 7. (Key the map on the running sum mod 7: two equal remainders differ by a multiple of 7.)

Look-alikes that call for something else: "the largest total of any stretch" has no k, so there is nothing to look up (that is Kadane's algorithm). "All values positive, total at most k" is a sliding window. "Many range sums on an array that does not change" needs prefix sums alone, no map: [range queries](/range-queries/).

## When to use it

Use it for an exact sum over stretches, any signs, one pass. It needs a hash map with O(1) lookups on average, which is what [chaining](/hash-chaining/) gives when the table stays short; a map whose keys all land in one bucket makes every lookup O(n), and the pass O(n²) again.

Avoid it when you need every subarray listed: there can be n(n + 1)/2 of them, and no trick lists them faster than that. Avoid it, too, for "sum at most k" with negatives: the map answers "equal", not "at most". And for tiny arrays, every pair of ends is simpler and just as fast.

## Common mistakes

- Forgetting seen = {0: 1}. Every subarray that starts at A[0] is lost.
- Recording the running sum before looking it up. With k = 0 each position counts itself.
- Looking up sum + k instead of sum − k. You want an earlier running sum that is k less.
- Overwriting first[s] for the longest. Keep the first time; a later one only makes shorter subarrays.
- Adding 1 for a hit instead of seen[sum − k]. One lookup can find several subarrays ([Four subarrays sum to 3](#example:count-with-negatives) finds two at once).
- Using a sliding window because "subarray" and "sum" are in the problem. Check for negative values first.

## Try this

- [Four subarrays sum to 3](#example:count-with-negatives): before you run it, write down the running sums and guess which lookup finds two.
- Load `1 -1 1 -1 1 -1` and find k = 0. Guess the count first.
- [Zeros: every subarray counts](#example:zeros-everywhere) with Approach set to every pair of ends. Which approach wins at n = 5?
- Press Compare, pick this page with other options, and set one side to every pair of ends. Fill it with 12 random values and watch `sums` on both sides.
- [No subarray sums to k](#example:nothing-sums-to-k): change k to 10. What does the map hold when the match is found?
