# Bloom filter

A Bloom filter answers one question: is x in the set? It answers in a few bits per key, however big the keys are, and it never stores the keys at all. The catch is in the answers. "No" is always right. "Yes" really means "probably".

Think of a web browser checking every URL against a list of a million bad sites. Downloading the list is out. A Bloom filter of the list fits in about a megabyte, and for almost every URL it says "definitely not bad" without asking anyone. Only the rare "probably" goes to the server for a real check.

## The operations

The filter is an array B of m bits, all 0 to start, and k hash functions h1 … hk, each mapping a key to a bit position.

| Operation | What it does | Cost |
|---|---|---|
| `insert(x)` | Sets bits h1(x), …, hk(x) to 1 | O(k) |
| `query(x)` | Checks bits h1(x), …, hk(x); any 0 means no | O(k) |
| `delete(x)` | Not possible (see below) | |

Neither cost depends on n, the number of keys. There's nothing to probe and nothing to resize: the filter is the same m bits on day one and day one thousand. It just gets fuller.

The hash functions here come from the universal family in CLRS, hᵢ(x) = ((aᵢ·x + bᵢ) mod 1009) mod m, with fixed aᵢ and bᵢ so you can follow the arithmetic. Every step shows the numbers: h1(12) = (71·12 + 5) mod 1009 mod 16 = 857 mod 16 = 9. A real filter uses fast hashes such as MurmurHash, often two of them combined as h1 + i·h2 to make k.

## Why "no" is certain and "yes" is not

Insert sets all k of a key's bits, and nothing ever clears a bit. So if x was inserted, all of its bits are 1, and query finds them. A Bloom filter never gives a false negative. [Never a false negative](#example:no-false-negatives) queries every key it inserted, then 13, which hits a 0.

The other direction fails. The bits of a key that was never inserted can all be 1 because other keys set them. In [A false positive](#example:false-positive), 45 was never inserted, but bit 13 belongs to 31, bit 9 to 12 and 47, and bit 15 to 25. Query sees three 1s and says "probably". [Show me](#play:false-positive).

```check
Q: A Bloom filter answers query(x) with "definitely not". What do we know?
* x was never inserted
- x was inserted, but another key overwrote its bits
- x might have been inserted, if we were unlucky
= Insert sets every bit of x and nothing clears a bit. If any bit of x is 0, x was never inserted.
```

## How often it lies

After n inserts, each with k hashes into m bits, a given bit is still 0 with probability about e^(−kn/m). A key never inserted gets a false positive when all k of its bits are 1:

p ≈ (1 − e^(−kn/m))^k

Variables shows this as `formula p`. It also shows `fill^k`, the same idea using the bits actually set (if 14 of 16 bits are 1, a random key passes all 3 checks with probability (14/16)³). **Measure** goes further and queries every key from 0 to 999 that was never inserted, so you get the real rate, counted.

The numbers on such a small filter are rough. In [A false positive](#example:false-positive) the formula says 14.7% and the measurement says 7.8%: 16 bits is a tiny sample. `fill^k` (8.4%) is much closer, because it uses the bits we actually have instead of the bits we'd expect.

Three knobs:

- **More keys, worse rate.** [A filter that is too full](#example:filling-up) puts 10 keys in 16 bits. 14 bits end up set, and two thirds of all other keys get a "probably". At that point the filter is close to useless. [Show me](#play:filling-up).
- **More bits, better rate.** The same keys in 32 bits: [More bits, fewer false positives](#example:bigger-filter) drops the measured rate from 66.8% to 27.7%.
- **The right k.** Each hash is another chance to find a 0, but also sets another bit. Too few hashes and a false positive needs only one lucky bit; too many and the bits fill up. The best k is about (m/n) ln 2. [Too many hash functions](#example:too-many-hashes) uses k = 6 where 3 is right, and the measured rate goes from 7.8% to 44.5%.

With the best k, the filter needs about 1.44·log₂(1/p) bits per key. For a 1% false-positive rate that's under 10 bits a key, whether the keys are numbers or 2 KB URLs.

```check
Q: m = 16 bits, k = 3 hash functions, and 10 keys inserted. You may change one thing to cut the false-positive rate. Which helps most?
- k = 6
* m = 32
- Query each key twice
= More hashes fill the bits faster. More bits leave more of them 0. Asking twice gives the same answer twice.
```

## Why there is no delete

Clearing the bits of x sounds easy, but a bit doesn't know who set it. In [Why there is no delete](#example:why-no-delete), 31 and 12 share bit 12. Clear the bits of 31 and query(12) finds a 0 and says "definitely not", although 12 is in the set. One false negative and the filter's only promise is gone. [Show me](#play:why-no-delete).

**Try delete** walks through the bits of a key and says which other keys would break, then leaves the filter alone. The usual fix is a counting Bloom filter: each position holds a small counter (4 bits is plenty) instead of one bit. Insert adds 1, delete subtracts 1, and query checks that every counter is above 0. You pay four times the space. And deleting a key that was never inserted still breaks it, so you'd better be sure.

## When to use it, and when not

Use a Bloom filter in front of something slow, when most answers are "no". Databases such as Cassandra and RocksDB keep one per file on disk, so a lookup skips the files that can't hold the key. A web cache can skip storing pages that were only requested once. A spell checker in 1970 (the original use) kept a dictionary in memory that didn't fit as words.

Avoid it when:

- a false positive is costly and you can't check it afterwards;
- you need to list the keys, count them, or delete them (the filter doesn't have them);
- the set is small enough to store. A hash set of 100 keys is simpler and never lies.

## Common mistakes

- Reading "probably" as "yes". It's "go and check".
- Picking m and k without knowing n. The rate depends on n/m, and a filter that grows past its planned n gets bad fast.
- Using k hash functions that aren't independent. If h2 is just h1 plus a constant, two keys that collide on one collide on all.
- Expecting the formula to hold for a 16-bit filter. It's an average over large filters; here **Measure** tells the real story.

## Try this

1. Load [A false positive](#example:false-positive) and query keys until you find another false positive. Which keys set its bits?
2. With m = 16, insert 4 keys and press **Measure**. Change k from 1 to 6 in Options and measure each time. Which k wins? Is it near (m/n) ln 2?
3. Insert 12, 25, 31 and 47, then **Try delete** 25. Which keys would break?
4. Insert keys one at a time and watch `formula p` and `fill^k`. When do they disagree most?
