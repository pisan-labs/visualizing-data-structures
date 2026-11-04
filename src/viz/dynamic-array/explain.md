# Dynamic array (resizing)

An array is fast because it is one block of memory: finding `A[i]` is a single address calculation. The catch is that the block has a fixed size. A dynamic array keeps the speed and drops the catch. It holds more slots than it needs, and when they run out, it copies everything into a bigger array.

Python's `list`, Java's `ArrayList` and C++'s `std::vector` all work this way.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `append(x)` | Add `x` at the end | O(1) amortized |
| `get(i)`, `set(i, x)` | Read or overwrite index `i` | O(1) |
| `insert(i, x)` | Shift everything from `i` on one slot right, then store `x` | O(n) |
| `removeAt(i)` | Shift everything after `i` one slot left | O(n) |
| `removeLast()` | Remove the last item | O(1) amortized |

## Growing by doubling

The array keeps two numbers. `size` is how many items it holds, and `capacity` is how many slots it has. While there is room, append stores `x` in `A[size]` and adds one to `size`. When `size == capacity`, append first allocates a new array twice as big, copies every item across, and only then stores `x`. [Show me](#play:doubling)

That copy is O(n). So is append O(n)?

## Why append is still O(1)

Most appends don't copy anything. Start with one slot and append 16 values. The copies happen on the 2nd, 3rd, 5th and 9th appends, and they copy 1, 2, 4 and 8 items. That is 15 copies for 16 appends. In general the copies add up to 1 + 2 + 4 + ..., a sum that always stays below 2n for n appends. Fewer than 2 copies per append, however long you keep going.

This is amortized analysis: a few expensive operations, paid for by lots of cheap ones. The **copies/append** variable keeps the running average. Watch it in [sixteen appends, under two copies each](#example:amortized). It jumps every time the array doubles, sinks back, and never reaches 2.

```check
Q: An array starts with 1 slot and doubles when full. How many values have been copied after 9 appends?
- 8
- 9
* 15
- 36
= The 2nd, 3rd, 5th and 9th appends find the array full, and they copy 1, 2, 4 and 8 values: 15 in all.
```

## Doubling or 1.5?

Any growth factor above 1 keeps append O(1) amortized. The factor trades memory for copying. Doubling copies less often but can leave half the slots empty. Growing by 1.5 wastes less space and copies more often. Java's `ArrayList` grows by 1.5. C++ libraries differ: GCC's `vector` doubles and Microsoft's grows by 1.5. Python's `list` grows by only about an eighth. Try the **When full, grow to** option, or have a look at [growing by half instead of doubling](#example:growth-1-5).

Growing by a constant does not work. Add 10 slots at a time and every 10th append copies everything. The copies add up to about n²/20, which makes append O(n) on average.

## Shrinking without thrashing

Remove most of the items and you are left with a big, mostly empty array. The obvious fix is to halve it when it drops to half full. Don't. Take 8 slots holding 5 items. Remove one: the array is half full, so it shrinks to 4 slots, and now it is completely full. Append one: it doubles back to 8. Each of those copies every item, and a run that alternates them copies on every single step. [Show me](#play:thrash)

The standard fix, the one CLRS uses, is to wait until the array is a quarter full before halving. Right after a shrink the array is half full, so it takes a lot of appends to force the next grow and a lot of removals to force the next shrink. [Shrinking at a quarter full](#example:shrink) shows it.

```check
Q: Why wait until the array is a quarter full before halving it, rather than half full?
- Copying a quarter of the items is faster than copying half
* Halving at half full leaves the array full, so the next append doubles it right back
- Arrays can only shrink to a power of two
= Halving at a quarter full leaves the new array half full, with room to grow and room to shrink before the next copy.
```

## Insert and remove in the middle

Inserting at index `i` needs a gap. Every item from `i` on moves one slot right, starting from the end so nothing gets overwritten. Removing at `i` closes the gap the other way. Both are O(n) in the worst case, which is the front of the array, and the **shifts** variable counts the moves. See [inserting at the front shifts everything](#example:insert-front) and [removing from the middle closes the gap](#example:remove-middle).

`get` and `set` are the opposite. The address of `A[i]` is the start of the array plus `i` slots, so they are O(1) at any index.

## When to use it

A dynamic array is the default list in most languages for good reason. Reading any index is O(1), appending is O(1) amortized, and the items sit next to each other in memory, which the processor's cache likes.

Avoid it when you insert or remove at the front a lot (a deque does both ends in O(1)), or when one slow append would hurt, as in a game loop or an audio callback. The average is fine. The worst case is still O(n).

## Common mistakes

- Growing by a constant amount instead of a factor. Append becomes O(n) on average.
- Shifting in the wrong direction. Insert has to start from the end; starting from `i` copies the same value into every slot after it.
- Shrinking at half full. One append and one removal at the boundary copy the whole array each time.
- Checking `i < capacity` instead of `i < size` in `get`. The slots past `size` hold leftovers or nothing.
- Reading "O(1) amortized" as "every append is fast". Most are. Every so often, one copies everything.

## Try this

- [Doubling as it fills](#example:doubling). Predict the capacity after each resize before you press play.
- [Sixteen appends, under two copies each](#example:amortized). Set the detail level to Milestones and watch copies/append.
- [Shrinking at half full thrashes](#example:thrash). Then switch **After a removal, shrink** to a quarter and step through it again.
- [Indices that are out of range](#example:bad-index).
- Fill the array, type `0 99` and press **Insert**. Count the shifts and the copies.
