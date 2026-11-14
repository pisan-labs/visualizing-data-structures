# Randomized set (random pick in O(1))

You want a set that does three things: insert a value, remove a value, and return a random value, each one equally likely. All three in O(1). Each half of the answer is easy on its own. A hash set inserts and removes in O(1) but cannot hand you its i-th value, so a random pick has to walk through it. An array picks a random index in O(1) but has to scan to find a value. So use both: the values in an array, and a hash map from each value to its index.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `insert(x)` | if x is not in the map, append it and record its index | O(1) expected |
| `remove(x)` | look up x's index, move the last value into the hole, fix that value's index | O(1) expected |
| `random()` | pick an index from 0 to n − 1, return the value there | O(1) |
| insert and remove, the array alone | scan the array to find x | Θ(n) |
| random, a hash set alone | walk to the i-th value | Θ(n) |

The map answers "where is x?" and the array answers "what is at index i?". Every operation keeps them in step: map[A[i]] = i for every i. [Show me](#play:swap-with-last)

The **Approach** option switches to the array alone, which scans. Both keep the same array, so random gives the same answers either way. `comparisons` counts A[i] compared with x, `lookups` counts hash map reads and writes, and `naive total` and `pattern total` say what each design has cost over all the operations so far.

## How it works

**insert(x):** if x is in the map, return false. Otherwise map[x] = n (the first free slot), append x, return true.

**remove(x):** look up i = map[x]; if x is not there, return false. Then:

1. take the last value, A[n − 1];
2. move it into the hole, A[i];
3. drop the last slot;
4. map[that value] = i, since it moved;
5. delete map[x].

In [Fill the hole with the last value](#example:swap-with-last), A = 4 7 2 9 5. remove(7) finds map[7] = 1. The last value, 5, moves into slot 1, the last slot goes, and map[5] becomes 1. A = 4 5 2 9. Nothing else moves, so no other index changes. Three lookups, whatever n is.

**random():** pick an index from 0 to n − 1, each with chance 1/n, and return A[i]. Every value sits at exactly one index, so every value comes back with chance 1/n.

```check
Q: A = 4 7 2 9 5. What is A after remove(4)?
- 7 2 9 5
* 5 7 2 9
- 4 7 2 9
- 7 2 9
= 4 is at index 0. The last value, 5, moves into slot 0 and the last slot goes: 5 7 2 9. Only 5's entry in the map changes.
```

## Why not shift?

The usual way to delete from an array shifts everything after the hole one slot left. That keeps the order, and it costs O(n) moves. Worse, every value that shifts has a new index, so its map entry is wrong. Remove 10 from 10 20 30 40 50 by shifting and four entries need fixing. Moving the last value breaks exactly one entry, and remove fixes it.

The price is order. [The order is not kept](#example:order-is-not-kept) inserts 10 20 30 40 50 60 and removes 10, 20 and 30. Each remove pulls the last value forward: A ends as 60 50 40. A set has no order to keep, so nothing is lost.

When x is already last, nothing moves: [Removing the last value moves nothing](#example:remove-the-last). The code still runs both map lines (map[x] = i, then delete map[x]), which is simpler than a special case.

```check
Q: A = 10 20 30 40 50 and the map holds each value's index. You remove 10 by shifting the rest left instead of moving the last value. How many entries of the map are now wrong?
- 0
- 1
* 4
- 5
= 20, 30, 40 and 50 each moved one slot left, so all four have a new index. Moving the last value into the hole changes one index, and remove fixes that one.
```

## Random picks an index

Picking at random is one call to a random number generator and one array read. On this page the generator is seeded, so an example plays the same way every time. In [Random picks an index](#example:draws-follow-the-array), the first two draws pick indices 3 and 2 of 10 20 30 40 50. Then remove(10) moves 50 into slot 0, and later draws find 50 there. The draw picks an index, not a value; the value is whatever lives there now.

The same move, swap with the last and shrink, is the heart of [Fisher–Yates](/fisher-yates/): pick a random index, swap it with the last, and the last slot is done.

## The array alone, and the hash set alone

The array alone checks every value for a duplicate on insert, and scans to find x on remove (then fills the hole the same way). [The array alone scans](#example:scan-to-find) runs the same operations as [Fill the hole with the last value](#example:swap-with-last): 12 comparisons against 13 lookups for the map. So at five values the map does not win. Inserting n new values costs the scan 0 + 1 + … + (n − 1) = n(n − 1)/2 comparisons and the map 2n lookups. They tie at n = 5. At n = 8 it is 28 against 16, and at a thousand values, 499,500 against 2,000.

A hash set alone is the opposite: insert and remove are O(1), and random is the problem. The values sit in buckets with gaps, and there is no "value number i". To pick one fairly you walk the set to a random position, O(n).

## Spot it

Reach for an array plus an index map when the problem says:

- **insert and delete** (join and leave, add and withdraw) at any time;
- **at random, each equally likely**, or "pick one without walking through";
- **all in O(1)**: so a scan, and a set with no index, are both out.

Three problems of our own:

- A raffle pool takes and withdraws tickets all day, and draws a winner in constant time, every ticket equally likely.
- A game server tracks the players online as they join and leave, and every few seconds gives a bonus to one at random.
- A music library adds and deletes songs, and a "surprise me" button plays a random one without walking the library.

Look-alikes: "evict the one unused the longest" is an [LRU cache](/lru-cache/): a map plus a linked list, because order of use matters. "Does this guess use exactly the tiles on my rack" is counting letters, no random pick at all.

## When to use it

Use it for a set (or a map) that needs fast random sampling: a pool of candidates, random load balancing, a randomized algorithm that keeps drawing from a changing set. It needs a hash map with O(1) expected lookups, as [chaining](/hash-chaining/) gives when the table stays short, and an array that grows in O(1) amortized, as a [dynamic array](/dynamic-array/) does.

Avoid it when the order matters: remove scrambles it. Avoid it for duplicates, too: a value can have only one index in the map. A multiset needs a set of indices per value, and remove then picks any one of them.

## Common mistakes

- Forgetting map[last] = i. The next remove of that value reads a slot that is gone, or someone else's slot.
- Deleting map[x] before writing map[last] = i when x is the last value. The write puts x back in the map, and x seems to be in the set forever. Write first, then delete.
- Shifting instead of moving the last value: O(n), and every shifted index is wrong in the map.
- Picking a random index from 0 to n instead of 0 to n − 1. Off by one, and sometimes off the end.
- Inserting without checking the map first, so a value lands in the array twice and random favors it.

## Try this

- [Fill the hole with the last value](#example:swap-with-last): before each step of remove(7), say which entry of the map changes.
- Insert 1 2 3 4 5 6, then remove 1, 2 and 3. Write A down before you press play.
- [A set refuses duplicates](#example:duplicates-refused): how many lookups did the two refused inserts cost?
- [Removing a value that is not there](#example:remove-missing) with Approach set to the array alone. Which remove costs the most comparisons?
- Press Compare, pick this page with other options, and set one side to the array alone. Fill both with 8 random values and watch `naive total` and `pattern total`.
