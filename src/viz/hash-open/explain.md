# Open addressing

Chaining hangs a list off every bucket. Open addressing doesn't bother with lists at all: every key lives in a slot of the array itself. When a key's slot is taken, it tries another slot, and another, following a fixed probe sequence h(k, 0), h(k, 1), h(k, 2), … until it finds an empty one. Search follows the same sequence, so it finds the key wherever insert put it.

No pointers, no extra memory, and keys sit next to each other in one array, which caches love. The price: the table can fill up, and deleting a key needs some care.

## The operations

| Operation | What it does | Average | Worst |
|---|---|---|---|
| `insert(k)` | Probes until an empty slot, then stores k there | O(1/(1 − α)) | O(m) |
| `search(k)` | Probes until it finds k or an empty slot | O(1/(1 − α)) | O(m) |
| `delete(k)` | Finds k and leaves a tombstone (DEL) in its slot | O(1/(1 − α)) | O(m) |

α = n/m is the load factor, and here it can never pass 1: each key needs a slot of its own. The averages assume the probe sequences behave like random orders of the slots (CLRS calls this uniform hashing). The worst case is a probe sequence that passes every slot in the table. Variables counts the `probes` of every operation, so you can see the cost directly.

## Probe sequences

h(k) = k mod m is the home slot, where probing starts. The **Probing** option decides where it goes next, and the pseudocode and narration show the formula with real numbers at every probe.

- **Linear**, h(k, i) = (h(k) + i) mod m. Try the next slot, then the next, wrapping around at the end. Simple, cache friendly, and every slot is reachable.
- **Quadratic**, h(k, i) = (h(k) + i²) mod m. Jump 1, then 4, then 9 slots past home. A **triangular** version, h(k) + i(i+1)/2, jumps 1, 3, 6, 10, … instead.
- **Double hashing**, h(k, i) = (h(k) + i·h2(k)) mod m. A second hash function picks the step size. CLRS uses h2(k) = 1 + (k mod (m − 1)); Weiss uses R − (k mod R) for a prime R just below m. The **Second hash** option switches between them.

Linear probing has a problem called primary clustering. Occupied slots form runs, and any key that lands anywhere in a run gets added to its end, so long runs grow faster than short ones. [Primary clustering](#example:primary-clustering): 55 starts at slot 0 and needs 6 probes. [Show me](#play:primary-clustering).

Quadratic probing breaks up the runs, but keys with the same home slot still follow exactly the same path ([Secondary clustering](#example:secondary-clustering)). Double hashing gives each key its own step size, so even keys with the same home slot go different ways. Same keys, double hashing: [Double hashing breaks up the cluster](#example:double-hashing).

```check
Q: Linear probing, m = 11. Slots 0 to 3 hold other keys and slot 4 is empty. Where does insert(22) go? (22 mod 11 = 0)
- Slot 0
- Slot 1
* Slot 4
- Insert fails
= 22 starts at slot 0 and probes 0, 1, 2, 3: all taken. Slot 4 is the first empty one.
```

## Deleting leaves a tombstone

Why not just empty the slot? Because search stops at an empty slot. Say 22, 33 and 44 all start at slot 0 and sit in slots 0, 1 and 2. Empty slot 1 and a search for 44 stops there, one slot too early, and reports that 44 isn't in the table. It is.

So delete writes a tombstone, DEL, meaning "a key used to be here". Search treats it as occupied and keeps going. Insert treats it as free, with a catch: it can't stop at the first tombstone, because k might already be stored further along. It keeps probing until it finds k or an empty slot, then goes back and reuses the first tombstone it passed. [Tombstones: search skips them, insert reuses them](#example:tombstones). [Show me](#play:tombstones).

Tombstones pile up. They aren't keys, so α ignores them, but probing has to walk past them just the same. A table with lots of deletes slows down until you rebuild it (rehash every live key into a fresh table). With linear probing there's another way out: after emptying a slot, reinsert the keys in the rest of its run, and no tombstone is needed. Sedgewick does it that way.

```check
Q: Linear probing: 22, 33 and 44 sit in slots 0, 1 and 2 (all three have h(k) = 0), and then 33 is deleted. Where does insert(55) go, if h(55) = 0 and slot 3 is empty?
- Slot 3, the first empty slot
* Slot 1, the tombstone
- Nowhere: 55 can't pass the tombstone
= Insert probes 0 (22), 1 (DEL, remember it), 2 (44) and 3 (empty). Reaching an empty slot proves 55 is new, so it goes into the first tombstone it passed: slot 1.
```

## The load factor and when probing fails

The fuller the table, the longer the probe sequences. With uniform hashing, a search that misses expects at most 1/(1 − α) probes: 2 at α = 0.5, 10 at α = 0.9. Linear probing does worse because of clustering. Knuth worked out about ½(1 + 1/(1 − α)²) probes for a miss: 2.5 at α = 0.5, but 50.5 at α = 0.9. That's why real tables grow long before they fill up.

Linear probing always finds an empty slot if there is one. The others can miss. With a prime m, the first (m + 1)/2 probes of quadratic probing land on different slots, and after that the sequence repeats itself. So quadratic probing is guaranteed to work only while the table is less than half full. [Quadratic probing misses empty slots](#example:quadratic-fails) has three empty slots out of seven and still fails. [Show me](#play:quadratic-fails). The triangular version reaches every slot when m is a power of 2 ([Triangular numbers reach every slot](#example:triangular)). Double hashing reaches every slot when h2(k) and m share no factor, which is why m is usually prime.

And when every slot holds a key, there's simply no room: [A full table](#example:full-table).

## When to use it, and when not to

Open addressing is a good choice for small keys, a known upper bound on the number of keys, and few deletes. It saves the pointer per key and keeps everything in one array, so it is often faster than chaining in practice. CPython's `dict` uses open addressing.

Avoid it when the table runs close to full, when deletes are frequent (tombstones), or when the keys are big records you'd rather not move around. Chaining copes with all three more gracefully.

## Common mistakes

- Emptying the slot on delete. Searches for keys further along the run start failing.
- Stopping insert at the first tombstone without checking the rest of the sequence. The key can end up in the table twice.
- Searching until a slot that holds a different key, instead of until an empty slot.
- Forgetting the mod m, so probes run off the end of the array instead of wrapping around.
- Using quadratic probing past α = 1/2, or double hashing with an m that shares a factor with h2(k).
- Letting h2(k) be 0. Every probe then lands on the same slot.

## Try this

- [Primary clustering](#example:primary-clustering). Before each insert, predict how many probes it takes. Then switch to double hashing in Options and play it again.
- [Tombstones: search skips them, insert reuses them](#example:tombstones). Which slot does 55 end up in, and why not slot 3?
- [Quadratic probing misses empty slots](#example:quadratic-fails). Switch to linear probing in Options and watch 7 find slot 3.
- Pick **All colliding keys** with 9 keys under each probing method and compare the `probes` of the last insert.
