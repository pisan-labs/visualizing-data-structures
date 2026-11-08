# Robin Hood hashing

Linear probing is simple and fast, until clusters form. Then a few unlucky keys end up far from their home slot, and every search for them, or for a missing key in that cluster, walks the whole way. The average is fine. The worst is not.

Robin Hood hashing (Celis, 1986) keeps linear probing and changes one rule. While walking forward to insert, compare how far the key in hand is from its home with how far the key in the slot is from its home. If the key in the slot is closer to home (richer), the key in hand takes its slot, and the richer key carries on looking. Take from the rich, give to the poor.

## The operations

The table has m slots and h(k) = k mod m. The probe distance of a key, d, is how many slots it sits past its home. The number under each key in the drawing is its d.

| Operation | What it does | Average | Worst |
|---|---|---|---|
| `insert(k)` | Walks forward from h(k), swapping with any key closer to home | O(1/(1 − α)²) | O(m) |
| `search(k)` | Walks forward; stops at k, an empty slot, or a key closer to home than k would be | O(1/(1 − α)) | O(m) |
| `delete(k)` | Finds k, empties the slot, and shifts the keys behind it back one | O(1/(1 − α)) | O(m) |

The averages are the same as plain linear probing. What changes is the spread. Variables shows `max d` and `sum d` for this table and for plain linear probing with the same keys in the same order.

## Take from the rich

[Take from the rich](#example:take-from-the-rich): 22 and 33 both have home 0 and sit in slots 0 and 1. 1 has home 1, so it lands in slot 2 at distance 1. Then 44 arrives, home 0. At slot 2 it is 2 from home, and 1 is only 1 from home. 44 takes the slot and 1 moves on to slot 3, now 2 from home. Both end up at distance 2. Plain linear probing would leave 44 at distance 3 and 1 at distance 1. [Show me](#play:take-from-the-rich).

Here's a surprise: the total distance doesn't change. Both rules fill exactly the same slots (an insert always ends at the first empty slot), so the distances add up to the same number. A swap doesn't create distance, it hands it from a rich key to a poor one. Robin Hood only shares it out more evenly, and the longest distance shrinks. [A crowded cluster, Robin Hood](#example:robin-cluster) and [The same cluster, plain linear probing](#example:linear-cluster) put the same 12 keys into 13 slots: total distance 57 both times, but the longest is 8 against 11. The **Probing** option switches between the two.

```check
Q: m = 11. Slot 3 holds 25 (home 3, d = 0). Inserting 13 (home 2) arrives at slot 3 with d = 1. What happens?
- 13 moves on to slot 4; 25 keeps its slot
* 13 takes slot 3, and 25 carries on looking at d = 1
- Insert fails: the slot is taken
= 25 is 0 from home and 13 is 1 from home. The key closer to home gives up its slot.
```

## Searches can stop early

The rule leaves the table sorted in a useful way: walking along a cluster, d never jumps up by more than 1. So when search reaches a key that is closer to its home than k would be at this point, it knows k isn't in the table. If k had been inserted, it would have taken this very slot.

[Search stops early](#example:early-stop): search(55) walks from slot 0 past 22, 33 and 44, then meets 1 at slot 3. 1 is 2 from home; 55 would be 3. So 55 isn't there, and search stops after 4 probes without walking to the end of the cluster. Plain linear probing has to reach an empty slot. [Show me](#play:early-stop).

## Deleting without tombstones

Open addressing usually leaves a tombstone when it deletes, so searches don't stop at the hole. Tombstones pile up and slow everything down. Robin Hood can do better: after emptying the slot, pull each following key back one slot, as long as it is away from home (d > 0). Stop at an empty slot or a key already at home. Every moved key gets one closer to home, and nothing is lost. [Backward-shift deletion](#example:backward-shift).

Plain linear probing can delete without tombstones too, with a little more care: a key may move back into the hole only if that doesn't put it before its home slot (Knuth's Algorithm R). With **Probing** set to plain linear probing, delete does that.

```check
Q: Slots 4 to 7 hold keys with d = 0, 1, 2, 0, and slot 8 is empty. The key in slot 4 is deleted. How many keys shift back?
- 0
* 2
- 3
= The keys in slots 5 and 6 (d = 1 and 2) move back. The key in slot 7 is at home, so the shifting stops there.
```

## When to use it, and when not

Use it when you want linear probing's speed and cache behavior with fewer bad cases: high load factors (0.9 is workable), lots of lookups for missing keys, or lots of deletes. Rust's standard HashMap used Robin Hood hashing for years, and many fast C++ hash maps still do.

Avoid it when:

- inserts dominate and keys are big (every swap moves a key, not just a pointer);
- you need pointers to entries to stay put (keys move on insert and delete);
- the table is rarely more than half full (plain linear probing is simpler and about as good).

## Common mistakes

- Comparing keys instead of distances. The rule is about how far each key is from home.
- Forgetting the wrap-around. A key with home 10 in slot 1 of an 11-slot table has d = 2, not −9.
- Using the early stop with tombstones in the table. Shifting deletes keep the invariant; tombstones break it.
- Expecting fewer probes on average for a hit. The average is the same as linear probing; the win is the spread and the faster misses.

## Try this

1. Load [Take from the rich](#example:take-from-the-rich) and switch **Probing** to plain linear probing. Where do 44 and 1 end up?
2. Insert 13, 26, 39, 52 and 65 into a table of 13. What is `max d`? Now with plain linear probing?
3. In [Backward-shift deletion](#example:backward-shift), delete 22 instead of 33. Which keys move?
4. Use the **Keys crowding the first slots** preset with 10 keys and compare `max d` with `linear max d`.
