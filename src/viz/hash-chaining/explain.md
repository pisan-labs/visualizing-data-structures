# Separate chaining

A hash table turns a key into an array index. A hash function h maps each key k to a bucket h(k) between 0 and m − 1, and the key goes there. Lookups skip the searching: compute h(k), go straight to that bucket.

Two keys that land in the same bucket collide, and collisions are not rare. Put 8 keys into 7 buckets and at least two must share. Even with 365 buckets, 23 random keys collide more often than not (the birthday paradox). So the real question is what a bucket does with more than one key.

Separate chaining gives the simplest answer: each bucket T[i] holds a linked list, a chain, of every key that hashes to i. Collide all you like. The chain just gets longer.

## The operations

| Operation | What it does | Average | Worst |
|---|---|---|---|
| `insert(k)` | Adds k to the chain of bucket h(k), unless it is already there | O(1 + α) | O(n) |
| `search(k)` | Walks the chain of bucket h(k) looking for k | O(1 + α) | O(n) |
| `delete(k)` | Finds k in its chain and unlinks it | O(1 + α) | O(n) |

α = n/m is the load factor: keys divided by buckets, which is also the average chain length. The 1 is the hash and the α is the walk. Grow m along with n so that α stays below some constant, and every operation is O(1) on average. Note the "on average". The worst case is O(n), and you can watch it happen below.

## How it works

Every operation starts the same way: compute i = h(k), then walk the chain of T[i]. Search compares k with each key until it finds k or falls off the end of the chain (nil). Insert does the same walk first, so a key never appears twice, and then adds a node. Delete keeps a second pointer, prev, one node behind x, so it can make prev.next skip the node it removes. If the node is first in its chain there is no prev, and T[i] itself changes. [Delete from a chain](#example:delete-chain) does both.

CLRS puts a new node at the front of the chain. That is O(1), and CLRS assumes the key isn't already in the table. We check first, because a set with two copies of 17 is not a set. Java's `HashMap` checks too, then adds new keys at the end of the chain instead. The **Where a new key goes** option switches between the two. Same keys, different chain order: [Collisions share a bucket](#example:collisions) and [New keys at the end of the chain](#example:tail-insert). [Show me](#play:collisions) the first one.

```check
Q: m = 7, h(k) = k mod 7, and new keys go to the front. After insert(3), insert(10), insert(17), what does bucket 3 hold, from the front?
- 3, 10, 17
* 17, 10, 3
- 10, 17, 3
= All three leave remainder 3 when divided by 7. Each new key becomes the first node, so the most recent one is in front.
```

## Hash functions

The **Hash function** option has four choices, and the narration spells out the arithmetic with real numbers every time.

- **Division**, h(k) = k mod m. Fast, simple and the CLRS default. Its weakness is that the remainder only sees k modulo m. With m = 10 the hash is the last digit, so 10, 20, 30, 40, 50 and 60 all land in bucket 0. [Keys with a pattern meet a bad table size](#example:pattern-keys). The usual advice is a prime m that isn't close to a power of 2.
- **Multiplication**, h(k) = ⌊m · frac(k · A)⌋ with A ≈ 0.618, Knuth's suggestion of (√5 − 1)/2. Multiply, keep the fraction, scale it up to the table size. For k = 42 and m = 7: 42 × 0.618034 = 25.9574, the fraction is 0.9574, times 7 is 6.70, so bucket 6. The choice of m matters much less here.
- **Character sum**, for words: add up the character codes, mod m. Easy to explain and easy to break, because addition doesn't care about order. stop, pots, tops, spot, opts and post all add up to 454. [Anagrams collide under the character sum](#example:anagrams).
- **Polynomial**, for words: treat the character codes as digits in base 31, then take mod m. Now order matters, and cat and act land in different buckets. Java's `String.hashCode` uses the same idea with the same base.

## The load factor

With chaining, α can go above 1. A table with 5 buckets holds 12 keys without complaint; the chains are just 2 or 3 long. [A load factor above 1](#example:high-load). Open addressing can't do that, because there every key needs its own slot.

If every key is equally likely to land in any bucket (CLRS calls this simple uniform hashing), a search for a missing key walks a whole chain, α keys on average. A search that succeeds stops partway, after about 1 + α/2 comparisons. Both are Θ(1 + α). Variables shows `α` and the `longest` chain after every step, so you can watch both as keys go in.

## The worst case

The analysis assumes the keys spread out. Nothing forces them to. Insert 0, 7, 14, 21, 28, 35 and 42 into a table with m = 7 and they all land in bucket 0. α is exactly 1, but one chain holds every key, and searching for 0 compares it with all seven. [Show me](#play:one-bucket). The **All colliding keys** preset builds the same mess for whatever table size and hash function you pick.

This isn't only a classroom trick. If an attacker chooses the keys (field names in a web request, say), they can choose keys that collide and slow the server to a crawl. It's called hash flooding, and it is why many languages now mix a random seed into their string hashes. Java's `HashMap` adds a second defence: when one chain gets long, it turns that chain into a balanced tree.

```check
Q: With m = 7 and h(k) = k mod 7, you insert 0, 7, 14, 21, 28, 35 and 42. What are α and the longest chain?
- α = 1 and the longest chain is 1
* α = 1 and the longest chain is 7
- α = 7 and the longest chain is 7
= Seven keys in seven buckets gives α = 1, but every key is a multiple of 7, so all seven share bucket 0. α is an average; it says nothing about the worst bucket.
```

## Keys and values

Switch **What the table stores** to key-value pairs and the table becomes a map. Type `cat=3` to insert. Inserting a key that's already there replaces its value instead of adding a node, and search hands back the value. [A map: inserting a key again updates its value](#example:key-value).

## When to use it, and when not to

Use a hash table when you look things up by exact key and don't care about order: counting words, caching results, remembering what you've already seen. Chaining is the forgiving version. It keeps working as α grows, deletes are easy, and a bad hash function makes it slow rather than broken. Java's `HashMap` and C++'s `std::unordered_map` both use chaining.

Skip it when you need the keys in order: the next key after 42, everything between 10 and 20, the smallest key. A balanced search tree does those; a hash table scatters keys on purpose. Chaining also pays for a pointer per key and jumps around memory, which is why open addressing is often faster for small keys.

## Common mistakes

- A hash function that ignores part of the key. k mod 10 sees only the last digit, and a string hash that looks at the first letter only puts every word starting with s in one bucket.
- A power of 2 or 10 for m with the division method. Real keys often share their last digits or bits.
- Forgetting the duplicate check, so one key ends up in its chain twice.
- Deleting with prev.next = nil instead of prev.next = x.next, which drops the rest of the chain.
- Deleting the first node and trying to update prev, which is nil. T[i] is what changes.
- Saying "hash tables are O(1)" and leaving out "on average".

## Try this

- [Collisions share a bucket](#example:collisions). Before pressing play, predict how many comparisons the search for 17 takes.
- [Every key in one bucket](#example:one-bucket). Then set m to 11 in Options and compare the longest chain.
- [Delete from a chain](#example:delete-chain): one delete from the middle, one from the front, and one that finds an empty bucket.
- [Anagrams collide under the character sum](#example:anagrams). Switch to the polynomial hash and watch them spread out.
- Fill the table with **All colliding keys** (12 of them), then with **Random keys**, and compare `longest`.
