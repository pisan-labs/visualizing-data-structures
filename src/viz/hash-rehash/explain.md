# Rehashing and load factor

Open addressing gets slow as the table fills, and it stops working when the table is full. Chaining keeps working, but its chains get longer. Either way the fix is the same: when the load factor α = n/m gets too high, make a bigger table and move every key into it. That's rehashing.

Here the table uses linear probing with h(k) = k mod m. Before adding a new key, insert asks: would one more key push α past the threshold? If so, it grows first.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `insert(k)` | Checks k is new, grows the table if α would pass the threshold, then stores k | O(1) amortized, O(n) for the insert that rehashes |
| `search(k)` | Probes from h(k) until k or an empty slot | O(1) on average, because α stays below the threshold |
| rehash | Makes a table about twice as big and reinserts every key | O(n + m) |

Variables keeps the score: `cost` is what this insert cost (1 for the store, plus 1 for every key a rehash moved), `total` is the cost of all inserts so far, and `amortized` is total divided by the number of inserts.

## Every key moves

Why can't the old keys stay where they are? Because a key's slot depends on m. 23 sits in slot 3 when m = 5, but 23 mod 11 = 1, so in the new table it belongs in slot 1. Leave it in slot 3 and a search for 23 looks in slot 1 and never finds it. So rehash walks the old table and inserts every key into the new one from scratch, probing as usual. [Growing to the next prime](#example:grow-prime). [Show me](#play:grow-prime).

Rehashing is also a chance to clean up. In a table with deletes, the tombstones all disappear, since only live keys are copied.

## Why it's still O(1)

A rehash of n keys is expensive. But right after one, α is about half the threshold, so it takes roughly n more cheap inserts to reach the next rehash. Spread the cost of the rehash over those inserts and each one pays a constant. In [Amortized cost: expensive inserts are rare](#example:amortized), ten inserts cost 21 in total: eight of them cost 1, and the two that rehash cost 4 and 9. [Show me](#play:amortized).

The constant factor matters. Grow by a fixed amount instead, say 10 slots at a time, and the rehashes come every 10 inserts while each one moves all n keys: n inserts then cost O(n²). Doubling (or about doubling) is what makes the arithmetic work. CLRS proves the same thing for dynamic tables with doubling: any sequence of n inserts costs O(n).

```check
Q: A table of 5 slots grows to 11 when the 4th key arrives (threshold 0.75). What does that 4th insert cost, counting 1 per key stored or moved?
- 1
- 3
* 4
- 11
= The three keys already there each move once (3), and then the new key is stored (1).
```

## Choosing the threshold

The **Grow when α would pass** option sets the trade-off. A low threshold such as 0.5 wastes space but keeps probe sequences short: [Threshold 0.5: grow sooner, use more room](#example:half-full). A high one saves space and pays in probes. With 1.0 the table only grows when it is completely full, which is how CLRS describes dynamic tables. With linear probing that means the last few inserts before a rehash walk long runs of taken slots: [Threshold 1.0: grow only when full](#example:threshold-one).

Java's `HashMap`, which uses chaining, grows at 0.75. Open addressing tends to grow earlier, because its probes get expensive faster than chains do: Sedgewick keeps linear probing at most half full, and CPython's `dict` grows at two thirds.

## Primes or doubling

The **New size** option picks between the first prime at least twice the old size, and exactly twice the old size. Doubling is simpler, and with a power-of-2 size, k mod m is just the low bits of k, which is fast. The catch: if the keys share low bits, they collide no matter how big the table gets. Multiples of 4 only ever land in slots 0, 4, 8 and 12 of a 16-slot table. [Doubling keeps powers of 2](#example:doubling). A prime size mixes in every bit of k. Libraries that use powers of 2 scramble the hash first to avoid exactly this (Java's `HashMap` mixes the high bits of the hash code into the low ones).

```check
Q: The table doubles from 4 to 8 to 16, and every key is a multiple of 4. How many of the 16 slots can a key land in directly (its home slot h(k))?
- 16
- 8
* 4
- 1
= k mod 16 for a multiple of 4 is 0, 4, 8 or 12. The other 12 slots are reached only by probing.
```

## When to use it, and when not to

Every general-purpose hash table rehashes: Python's `dict`, Java's `HashMap`, C++'s `std::unordered_map`. If you know how many keys are coming, size the table up front (Java's `HashMap(int initialCapacity)`, C++'s `reserve`) and skip the rehashes entirely.

The pause is the catch. The insert that triggers a rehash takes O(n) time all at once. For most programs nobody notices. For a game loop or a latency-sensitive server it can be a visible hiccup, and some systems rehash incrementally instead, moving a few keys on every operation while both tables are alive.

## Common mistakes

- Copying the array of slots into a bigger array as it is. The keys are in the wrong slots for the new m.
- Growing by a constant amount, which turns n inserts into O(n²).
- Counting a duplicate insert towards n and growing for no reason.
- Forgetting to reset the hash function to the new m (or caching h(k) computed with the old m).
- Rehashing in the middle of a probe, so the probe continues in the wrong table.

## Try this

- [Growing to the next prime](#example:grow-prime). Before each rehash, predict which slot every key moves to.
- [Amortized cost: expensive inserts are rare](#example:amortized). Then switch to threshold 0.5 and compare `total` and `amortized`.
- [Doubling keeps powers of 2](#example:doubling), then switch **New size** to primes and play it again.
- Fill with **Sequential keys** (12) under each threshold and compare the final m and α.
