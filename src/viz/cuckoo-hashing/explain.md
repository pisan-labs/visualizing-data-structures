# Cuckoo hashing

Most hash tables promise O(1) lookups on average and shrug about the worst case. A chain can get long; a probe sequence can wander. Cuckoo hashing (Pagh and Rodler, 2001) makes a stronger promise: a lookup looks in two places, always. Every key has exactly two possible nests, one in each of two tables, and it lives in one of them or it isn't there.

The name comes from the cuckoo, which lays its egg in another bird's nest and pushes the owner's egg out. Insert does the same thing.

## The operations

There are two tables T1 and T2 of m slots, and two hash functions. Here they are the textbook pair h1(k) = k mod m and h2(k) = ⌊k/m⌋ mod m, so you can work every step out by hand.

| Operation | What it does | Cost |
|---|---|---|
| `search(k)` | Looks at T1[h1(k)], then T2[h2(k)] | O(1) worst case: 2 probes |
| `delete(k)` | Empties whichever of the two holds k | O(1) worst case |
| `insert(k)` | Puts k in T1[h1(k)], kicking out the old key, which goes to its other nest, and so on | O(1) expected, O(n) with a rehash |

Under each key the drawing shows its other nest (T2:4 means "if kicked out, I go to slot 4 of T2"), so you can predict where a kick will send it.

## Insert: the kick chain

Insert never searches for an empty slot. It puts k in its T1 nest, whatever is there. If that slot held y, y is now homeless and goes to its T2 nest, kicking out whatever is there, which goes to its T1 nest, and so on until a key lands in an empty slot.

[A chain of kicks](#example:kick-chain): 26 and 125 both want T1[4], and each one pushes the key there over to T2. Then 37 arrives, also wanting T1[4]. It kicks 125, which kicks 4, which goes back to T1[4] and kicks 37 itself out to T2. Three kicks, and every key ends up in one of its two nests. [Show me](#play:kick-chain).

The keys move as themselves (watch 4 go from T1 to T2 and back), which is the whole trick: a key may be moved many times, but it's only ever in one of two places.

```check
Q: m = 11. T1[4] holds 26. Where does insert(37) put 37, and what happens to 26? (37 mod 11 = 4, ⌊26/11⌋ mod 11 = 2)
* 37 goes in T1[4]; 26 moves to T2[2]
- 37 goes in T2[3] because T1[4] is taken
- 26 stays; insert fails
= Insert always takes the T1 nest. The old key moves to its other nest, T2[h2(26)] = T2[2].
```

## Cycles and rehashing

Sometimes the kicks go round in circles. [A cycle forces a rehash](#example:cycle-rehash) inserts 5, 126 and 247, which all have h1 = 5 and h2 = 0: three keys, two nests between them. No amount of kicking will fit them. [Show me](#play:cycle-rehash).

How does insert know it's stuck? The textbook version gives up after some maximum number of kicks (MaxLoop, about 3 log n), which works but sometimes gives up too early. Here we use an exact test that falls out of the analysis of the kick walk: if the key we started with is kicked out a second time, so it's homeless for the third time, the walk is in a loop that will never end. The tests check this rule against a brute-force version that remembers every configuration of the tables.

The fix is a rehash: pick new hash functions and insert every key again. Here "new hash functions" means a new m, the next prime, which changes both h1 and h2. In the example the tables grow from 11 to 13 slots and the three keys go to three different places.

## How full can it get?

With two tables and random hash functions, inserts take O(1) expected time as long as the load n/2m stays below 1/2. Past that, cycles become likely quickly and rehashes eat the gains. [Close to half full](#example:half-full) puts 10 keys in 22 slots; watch the chains get longer as it fills.

Half empty sounds wasteful, and it is. Real cuckoo tables fix it in two ways:

- **Buckets.** Each slot holds 4 keys instead of 1. A lookup still checks two places (8 keys, all in two cache lines) and the tables can be over 90% full.
- **More hash functions.** With 3 nests per key, loads of about 90% work too.

A small **stash**, a few extra slots for keys that hit a cycle, avoids most rehashes.

## Deleting is easy

Open addressing needs tombstones because search walks along a probe sequence and must not stop early at a hole. Cuckoo search never walks: it looks at two slots. So delete just empties the slot. [Delete needs no tombstone](#example:delete-no-tombstone).

```check
Q: Why does cuckoo hashing not need tombstones when deleting?
- Deleted keys are moved to the other table
* Search only ever looks at a key's two nests, so an empty slot cannot hide anything
- The table is rehashed after every delete
= Tombstones exist so a probe sequence does not stop early. Cuckoo search has no sequence, just two fixed slots.
```

## When to use it, and when not

Use cuckoo hashing when lookups must be fast every time, not just on average: network switches and routers doing lookups in hardware, caches, and anywhere a lookup's worst case matters more than an insert's. Cuckoo filters, a cousin of the Bloom filter that supports delete, store short fingerprints the same way.

Avoid it when:

- inserts dominate, especially near the load limit (kick chains and rehashes get expensive);
- you can't pick fresh hash functions (an adversary who knows them can force cycles);
- memory is tight and you can't use buckets.

## Common mistakes

- Using two hash functions that are related. If h2 is a function of h1, keys that share one nest share the other, and cycles appear at tiny loads. Our textbook pair has a weak spot too: keys that differ by a multiple of m² share both nests, which is how the cycle example was built.
- Searching beyond the two nests. There's nothing to find there.
- Kicking forever. Always bound the walk, by MaxLoop or by a cycle test.
- Rehashing with the same m and the same functions. The same keys hit the same cycle.

## Try this

1. Load [A chain of kicks](#example:kick-chain) and step through the last insert. Before each kick, predict where the homeless key goes from the note under it.
2. Insert 5, 126 and 247 into tables of 7 slots. Do they still collide? (Work out h1 and h2 first.)
3. Use the **Random keys** preset with 9 keys a few times. How often does a rehash happen? Then try m = 5.
4. Load [Lookups take at most two probes](#example:two-probes) and search for keys that aren't there. Does the probe count ever pass 2?
