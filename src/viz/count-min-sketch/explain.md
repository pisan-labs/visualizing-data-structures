# Count-min sketch

A router sees billions of packets a day and wants to know which addresses send the most. A search engine wants the most common queries. Keeping an exact count for every address or query means a hash map with one entry per distinct item, which can be most of the stream. A count-min sketch keeps d·w counters instead, fixed in advance, and still answers "how often did x appear?" with an answer that is never too low and usually close.

## The operations

The sketch is a table C of d rows and w columns, all 0. Row i has its own hash function hᵢ that picks a column.

| Operation | What it does | Cost |
|---|---|---|
| `add(x)` | Adds 1 to C[i][hᵢ(x)] in every row | O(d) |
| `estimate(x)` | Returns the smallest of C[1][h1(x)], …, C[d][hd(x)] | O(d) |
| `heavy()` | Reports items whose estimate is at least φ·N | O(d) per item checked |

N is the length of the stream so far. Nothing depends on N or on the number of distinct items, including the space: d·w counters, whether the stream has 20 items or 20 billion.

The hash functions here are hᵢ(x) = ((aᵢ·x + bᵢ) mod 1009) mod w, a universal family from CLRS with fixed constants so you can check every step. The table on the right lists each item's true count next to its estimate, so you can see exactly how far off the sketch is. (A real sketch doesn't keep that table. That's the whole point.)

## Why the minimum

Every add of x bumps one counter of x in every row. So each of x's counters holds x's true count plus the counts of everything else that hashed to the same column. Other items can only add to a counter, never take away. Every counter is too high or exactly right, and the smallest one is the best guess.

In [Estimates are never too low](#example:overestimate), 42 was added 3 times and has a counter to itself in row 1: estimate 3, exact. 9 was added once, but shares a counter with another item in every row, so its estimate is 2. And 50 was never added at all, yet gets 1. [Show me](#play:overestimate).

```check
Q: x was added 4 times. Its counters in the three rows hold 6, 4 and 9. What does estimate(x) return, and could the true count be 5?
* 4, and no: every counter is at least the true count
- 6, the middle value
- 9, and yes, the estimate can be below the true count
= Each counter is the true count plus whatever else landed there. The minimum is 4, and the true count can be at most 4.
```

Why several rows? One row is a hash table where colliding items simply add up. With d rows and independent hashes, an item needs bad luck in every row at once to be badly overestimated. Compare [One row is not enough](#example:one-row) with the three-row version.

## How close is close

Cormode and Muthukrishnan's guarantee: pick w = ⌈e/ε⌉ and d = ⌈ln(1/δ)⌉. Then every estimate is at most the true count plus εN, with probability at least 1 − δ. Variables shows ε = e/w, δ = e^−d and the bound εN as the stream grows.

Read it carefully. The error is a fraction of the whole stream, not of x's count. For a heavy item that's fine: 7 appearing 6 times in 20 is estimated at 7. For a rare item, εN can be bigger than its true count, and the estimate tells you almost nothing. The sketch is good at "which items are big?" and bad at "how many times did this rare thing happen?".

The two knobs do different jobs. w controls the size of the error: [Too few counters per row](#example:narrow-sketch) halves w and 9 goes from an estimate of 2 to 3. d controls how often the bound holds. Width buys accuracy, depth buys confidence.

## Heavy hitters

An item is a heavy hitter if it makes up at least a fraction φ of the stream. **Heavy hitters** estimates every item seen and reports the ones at φ·N or above. Because estimates are never too low, no real heavy hitter is missed. Overestimates can let in a few that don't belong; these are marked in red. [Finding the heavy hitters](#example:heavy-hitters) has a skewed stream of 20 items where 7 and 3 stand out. [Show me](#play:heavy-hitters).

Checking every item seen is cheating a little: it means remembering every item. Real systems keep a small heap of the current top candidates while the stream goes by, and use the sketch only for their counts.

```check
Q: φ = 0.2, the stream has N = 30 items, and y appeared 7 times. Can heavy() miss y?
- Yes, if y's counters collide with other items
* No, its estimate is at least 7, and 6 is the bar
- Yes, if d is too small
= Collisions only push estimates up. y's estimate is at least 7, which is above 0.2·30 = 6.
```

## Variants

- **Conservative update.** Before adding, work out the current estimate e. Then raise each of x's counters only to e + 1, leaving larger ones alone. The counters stay smaller, so estimates are closer: [Conservative update](#example:conservative-update) gets 9 exactly right. The catch is that you can no longer subtract.
- **Count sketch** (Charikar, Chen and Farach-Colton) adds or subtracts 1 in each row by another hash and returns the median. Errors can go either way but cancel out better for skewed data.
- **Weighted adds.** add(x, c) adds c instead of 1, which counts bytes per address instead of packets. With negative c and standard update, the sketch can follow counts that go down, as long as no true count goes below 0.

## When to use it, and when not

Use it for frequencies in a stream too big to count exactly: top queries, busy network flows, popular products, the counts behind a heavy hitters list. It merges nicely too: two sketches with the same hashes add up counter by counter.

Avoid it when:

- you need exact counts, or counts of rare items;
- the number of distinct items is small enough for a hash map;
- you need to list the items. The sketch only answers questions about items you already name.

## Common mistakes

- Taking the average or the maximum of the counters instead of the minimum.
- Using the same hash function for every row. Then every row collides the same way and d rows are no better than one.
- Reading the error bound as relative to x's count. It's εN, relative to the whole stream.
- Expecting the guarantee on a tiny sketch. With w = 8, ε is 0.34: the bound is a third of the stream.

## Try this

1. Load [Estimates are never too low](#example:overestimate), then estimate other numbers you never added. How many come back 0?
2. Add the same stream with w = 4, 8 and 16 (Options). Watch how the "+" column in the table changes.
3. Switch to conservative update and replay [Finding the heavy hitters](#example:heavy-hitters). Which estimates change?
4. Use the **Skewed stream** preset with 30 items, then press **Heavy hitters** with φ = 0.1. Did any false heavy hitters slip in?
