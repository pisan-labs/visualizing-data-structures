# Skip list

A skip list is a sorted linked list with express lanes. Level 1 links every key in order. Level 2 links about half of them, level 3 about a quarter, and so on up. To find a key, start on the top lane at the head and run right while the next key is smaller than the one you want. When it isn't, drop down a lane and keep going. Most of the list goes by on the fast lanes.

William Pugh published the idea in 1990 as an alternative to balanced trees. There's no rotation and no rebalancing. Each node decides its own height by flipping coins when it is inserted, and never changes it.

## The operations

| Operation | What it does | Expected | Worst |
|---|---|---|---|
| `search(k)` | Right while smaller, else down | O(log n) | O(n) |
| `insert(k)` | Search, flip coins for a height, link in | O(log n) | O(n) |
| `delete(k)` | Search, unlink on every level of k | O(log n) | O(n) |

Expected is the average over the coin flips, for any keys in any order. Space is about n / (1 - p) pointers: 2n with a fair coin.

## Coin flips decide the height

A new node starts 1 level tall. Flip a coin: heads, it grows a level and you flip again; tails, it stops. With p = 1/2, half the nodes stop at level 1, a quarter at level 2, an eighth at level 3. So level i holds about n / 2^(i - 1) nodes, and there are about log₂ n levels. The **Maximum level** option caps the height, so a long run of heads can't build a tower to the moon. [Build a skip list with coin flips](#example:build), and watch the flips beside the key.

Insert searches for k the usual way, but remembers the last node before k on every level (Pugh calls it the update array). After the flips, the new node is linked in on each of its levels, right after that node. If it is taller than every other node, the list gets more levels, and on the new ones the node before it is the head. [A lucky node reaches the maximum level](#example:tall-tower).

Delete does the same search, then unlinks the node on every level it reaches. If it was the only node on the top level, the list loses that level. [Deleting the tallest node lowers the list](#example:delete-tallest).

```check
Q: With p = 1/2, about what fraction of the nodes reach level 3 or higher?
- 1/2
* 1/4
- 1/8
- 1/3
= A node reaches level 3 when its first two flips are both heads: 1/2 × 1/2 = 1/4.
```

## Why search is O(log n), on average

Search starts at the head on the top level. On each level it moves right while the next key is smaller than k, and drops down otherwise. [Show me](#play:search-path) a search that finds its key and one that doesn't.

How many moves right on one level? Run the search backwards: from where it stopped, walk back up and left. At each node, the walk climbs if that node is taller (chance p) and goes left if it isn't. So you expect about 1/p moves on a level before it climbs, which is 2 with a fair coin. About log₂ n levels with about 2 moves each is about 2 log₂ n steps: O(log n). Pugh's paper does this carefully. The answer comes out the same.

The coin flips don't look at the keys, so no input order is bad. Sorted keys, reversed keys, random keys: the expected cost is the same. That's the big difference from a plain BST, where sorted input builds a chain.

## Why the worst case is O(n)

The flips are random, so they can be unlucky. If every flip comes up tails, every node is 1 level tall and the skip list is just a linked list. A search walks the whole thing. [Unlucky flips: a skip list that is just a list](#example:flat-list). The chance of that is tiny for a long list, but it isn't zero, so the worst case is O(n). In practice you get O(log n) with overwhelming probability, and no adversary can pick keys that make it worse.

```check
Q: Search is on level 2, standing on 30, looking for 45. The next key on level 2 is 50. What does it do?
- Move right to 50
* Drop down to level 1, still standing on 30
- Go back to the head
- Report that 45 is missing
= 50 is not smaller than 45, so the search can't move right on this level. It drops down and keeps looking from 30.
```

## A fair coin or a biased one

The **Chance that a coin flip adds a level** option switches between p = 1/2 and p = 1/4. With 1/4, towers are shorter and there are about 1.33n pointers instead of 2n, but each level takes a few more moves right. Pugh suggested 1/4 unless you care more about how much the running time varies. [With p = 1/4 the towers are shorter](#example:quarter) uses the same random numbers as the first example, so you can compare tower by tower.

On a phone, set **Draw the list** to down. The keys go top to bottom and the levels left to right, so a long list stays readable.

## When to use one, and when not to

Skip lists are easy to get right: the code is a few loops and some pointers, and there is no rebalancing case to forget. They also behave well with many threads, because an insert only touches a few neighbors. Java's `ConcurrentSkipListMap` is one, and Redis uses one for its sorted sets.

Avoid one when you need a guaranteed bound on every operation, since the bound is only expected; a balanced tree promises O(log n) every time. And on disk, a B-tree reads far fewer pages.

## Common mistakes

- Forgetting the head on the new levels when the node is taller than the list. Those update entries have to be the head, or the new levels are never linked.
- Moving right while the next key is at most k instead of less than k. The search then steps past the key it was looking for.
- Flipping without a cap. Rare, but a run of heads can make a tower far taller than the list needs.
- Not lowering the list's level after a delete empties the top level. Nothing breaks, but every search starts higher than it needs to.
- Reading the expected O(log n) as a guarantee. It's an average over the coins, not a promise for one search.

## Try this

- [Build a skip list with coin flips](#example:build). Before each insert, guess how tall the new node will be, then count the heads.
- [Search: right while smaller, else down](#example:search-path). Count the moves right on each level.
- Pick **Ascending, 10, 20, 30...** with 14 keys, then **Random order**. The expected shape is the same, unlike a BST.
- [Unlucky flips](#example:flat-list), then search for the largest key and count the comparisons.
- Switch p to 1/4 and compare the `pointers` readout with p = 1/2 for the same keys.
