# Exponential search

You are looking for a page in a book with no page numbers on the spine and no idea how thick it is. You check page 1, 2, 4, 8, 16, ... until you have gone past it. Now you know a range, and binary search does the rest. That is exponential search. It also goes by doubling search and galloping search.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `search(x)` | Returns an index of x in sorted A, or -1 if x is not there | O(log i), where x is at index i |

Two phases.

1. **Jump.** Start with `bound = 1`. While `A[bound] < x`, double it: 1, 2, 4, 8, ... Stop when `A[bound]` is not smaller than x, or bound runs off the end.
2. **Binary search** the stretch between the last two jumps, `A[bound/2 .. min(bound, n - 1)]`. Everything before `bound/2` was smaller than x, and `A[bound]` is not, so if x is anywhere, it is in there.

In [Doubling, then binary search](#example:doubling), the jumps look at `A[1]`, `A[2]`, `A[4]` and `A[8]`. `A[8] = 41` is bigger than 26, so 26 has to be in `A[4..8]`. Binary search finds it in `A[5]`. The dashed window shows where x can still be; the faded values have been ruled out. [Show me](#play:doubling)

## Why log i

If x is at index i, the jumps pass it after about log₂ i doublings. The last stretch is about i/2 values long, so binary search on it takes about log₂ i probes too. That is roughly 2 log₂ i probes, and it has nothing to do with n.

So x near the front is cheap however long A is. In [Near the front](#example:near-front), 3 is in `A[0]`. `A[1] = 7` is already bigger, so the jumps stop at once, and binary search has two values to look at. 2 probes. Binary search on all 20 values takes 4. On a million values, binary search takes 20 and exponential search still takes 2.

```check
Q: A has a million sorted values and x is in A[5]. About how many probes does exponential search take?
* About 6
- About 20
- About 40
- About 500,000
= The jumps look at 1, 2, 4 and 8, and A[8] passes x. Binary search on A[4..8] takes at most 3 more. The million never comes into it.
```

## The price

Nothing is free. When x is near the end, the jumps go all the way out and the last stretch is half the array. That is about 2 log₂ n probes, twice what binary search takes. In [Near the far end](#example:far-end), 58 is in `A[11]`. The jumps go to 1, 2, 4, 8 and 16, then binary search works on `A[8..16]`: 9 probes. Plain binary search takes 3. [Show me](#play:far-end)

When x is bigger than everything, bound runs off the end. Phase 2 then searches from `bound/2` to the last index. [Bigger than everything](#example:past-the-end)

```check
Q: Where does exponential search beat binary search on a sorted array of known length?
* When x is near the front
- When x is near the end
- When x is not in the array
- Never: binary search is always at least as fast
= The cost is about 2 log₂ i for x at index i. For small i that is less than log₂ n; near the end it is about twice as much.
```

## When to use it

- **You do not know n.** A sorted stream, a huge file you would rather not measure, or an array you can only read by index until you hit the end. Binary search needs both ends. The jumps find an end for it. If reading past the end gives you "infinity", the same loop works with no n at all.
- **x is likely near the front.** Merging a short list into a long one, for example. Timsort gallops this way when one run keeps winning a merge: it jumps ahead to find how many values it can copy in one go.
- **Search from a finger.** If the last answer was at index k and the next x is close, jump from k instead of from 0.

Avoid it when x could be anywhere in an array you already know the size of. Plain binary search is simpler and up to twice as fast.

## Common mistakes

- Searching unsorted values. `A[bound] < x` only means "x is further right" when A is sorted. This page refuses and shows where the order breaks. [Unsorted values](#example:unsorted)
- Starting with `bound = 0`. Doubling 0 gives 0, forever.
- Forgetting `bound < n` in the loop, and reading past the end.
- Binary searching from 0 to bound instead of from bound/2. It still works, but you throw away the point of the jumps.
- Searching `A[bound/2 .. bound]` without the min. When bound has run past the end, hi has to be `n - 1`.

## Try this

- [Near the front](#example:near-front). Then search for 7 and 12. When does it stop beating binary search?
- [Doubling, then binary search](#example:doubling). Before each jump, say whether it is the last one.
- [Near the far end](#example:far-end): count the probes in each phase.
- Load the preset **x near the front** at size 20, then **x near the end**. Compare the probes with binary search's at the end of each run.
