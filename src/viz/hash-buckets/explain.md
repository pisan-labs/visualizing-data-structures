# Hashing with buckets

So far each hash value named one slot. Bucket hashing groups the slots instead: the table has B buckets, each with room for b keys, and h(k) = k mod B picks the bucket. A key goes in the first free slot of its bucket. Collisions are fine until a bucket fills up. Then what? Two answers:

- **An overflow area.** Keys whose bucket is full go into one shared list at the end of the table.
- **Report an overflow.** The insert fails. The key can only live in its own bucket, even if every other bucket is empty.

Why bother? Because of disks. Reading one block from a disk costs about the same whether it holds one record or fifty, so databases and file systems hash to a block (a bucket) and then search inside it. A bucket the size of a block means most lookups cost one read.

## The operations

| Operation | What it does | Average | Worst |
|---|---|---|---|
| `insert(k)` | Puts k in a free slot of bucket h(k), or in the overflow area | O(b) | O(n) |
| `search(k)` | Reads bucket h(k), then the overflow area if the bucket is full | O(b) | O(n) |
| `delete(k)` | Frees k's slot and pulls a waiting key back from the overflow area | O(b) | O(n) |

b is a constant, so O(b) is O(1). The overflow area is a plain list, read from the front, so a table that leans on it slows down to O(n). Variables shows `probes` (every slot looked at), `α` = n/(B·b), and how many keys sit in the overflow area.

## How it works

Insert hashes k to bucket i and reads all b slots, both to find a free one and to make sure k isn't already there. If there's a free slot, k goes in the first one. If the bucket is full, insert checks the overflow area for k and then adds k to the end of it. [A full bucket spills into the overflow area](#example:overflow-area). [Show me](#play:overflow-area).

Search reads bucket i. If k isn't there and the bucket has a free slot, search can stop: k would only have gone to the overflow area if its bucket had been full. If the bucket is full, k may have overflowed, so search reads the overflow area too. That's why the search for 30 in the example reads two more slots than the search for 8.

```check
Q: 5 buckets of 2 slots, h(k) = k mod 5. Bucket 0 holds 10 and 15, and the overflow area holds 20 and 25. How many slots does search(30) look at?
- 2
* 4
- 6
= 30 mod 5 = 0. Bucket 0 is full and doesn't hold 30, so search reads the whole overflow area as well: 2 + 2 = 4 probes, and 30 isn't there.
```

## Delete has to keep the promise

That early stop relies on a promise: a key is in the overflow area only if its bucket is full. Delete can break it. Free a slot in a full bucket while one of its keys is still waiting in the overflow area, and the next search for that key stops at the free slot and misses it.

So delete keeps the promise: after freeing a slot in bucket i, it looks for a key of bucket i in the overflow area and moves it back into the slot. [Delete pulls a key back from the overflow area](#example:delete-pulls-back). [Show me](#play:delete-pulls-back). Another fix is to never stop early and always read the overflow area, which is simpler and slower.

## Report instead of overflow

The **When a bucket is full** option switches off the overflow area. Now a full bucket means the insert fails: [No overflow area: a full bucket refuses the key](#example:report-overflow). 20 and 25 are refused while four buckets sit empty. It sounds harsh, but it is honest about a fixed amount of space, and search never reads more than one bucket.

```check
Q: Without an overflow area, 5 buckets of 2 slots can hold 10 keys. What is the smallest number of inserts of new keys that can already fail?
- 10
- 6
* 3
= Three keys that hash to the same bucket: the first two fill it and the third is refused, whatever the other buckets look like.
```

## When to use it, and when not to

Buckets pay off when reading a group of keys costs the same as reading one: disk blocks, cache lines, SSD pages. With b chosen to fill a block and keys spreading evenly, nearly every operation is one block read. [Keys that spread evenly](#example:even-spread) fills 12 of 15 slots without a single overflow.

They work badly when the keys don't spread. Once many keys share a bucket, the overflow area becomes one long list and every search through it is O(n): [Every key in one bucket](#example:one-bucket). The table also can't grow. When the overflow area gets long, the usual fix is to rebuild with more buckets, or to use a scheme that splits buckets as they fill (extendible hashing and linear hashing do this in databases).

## Common mistakes

- Stopping a search at the first empty slot of a bucket. After a delete, a key can sit in a later slot.
- Freeing a slot without pulling a waiting key back from the overflow area, so a search stops at a bucket with room and misses that key.
- Putting a key in a different bucket because its own bucket is full. Search will never look there.
- Forgetting that the overflow area is unsorted. Finding something there means reading it from the front.
- Counting only buckets in the load factor. Keys in the overflow area are keys too.

## Try this

- [A full bucket spills into the overflow area](#example:overflow-area). Predict the probes for each search before you play it.
- [Delete pulls a key back from the overflow area](#example:delete-pulls-back). Turn off the pulling in your head: which search would go wrong?
- [No overflow area: a full bucket refuses the key](#example:report-overflow). Then set the slots per bucket to 4 in Options and play it again.
- Fill with **All colliding keys** (12 of them), then **Random keys** (12), and compare the `overflow` count.
