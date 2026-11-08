# d-ary heap

A d-ary heap is a [binary heap](/binary-heap/) where every node has up to d children instead of two. Same array, same heap order, same sift-up and sift-down. The only thing that changes is the arithmetic that finds a parent or a child.

Why bother? Because d is a knob. Turn it up and the tree gets flatter, so a key climbing to the root passes fewer levels. But a key sinking down has more children to look at on every level. Inserts and decrease-key get cheaper, extracts get costlier. Pick d to match what your program does most.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `insert(key)` | Put it in the first free slot, sift it up | O(log_d n) |
| `extract()` | Take the root, move the last key up, sift it down | O(d log_d n) |
| `updateKey(i, key)` | Change a key, sift it up or down | up: O(log_d n), down: O(d log_d n) |
| `build(list)` | Copy in, sift down from the last parent back to the root | O(n) |
| `peek()` | The root | O(1) |

With n = 1,000,000 keys a binary heap has 19 levels below the root. A 4-ary heap has 10. A 16-ary heap has 5. That's the whole appeal, in three numbers.

## Where the children are

Indexed from 1, as in CLRS, the children of A[i] sit side by side:

```
parent(i)   = ⌊(i − 2)/d⌋ + 1
child(i, j) = d(i − 1) + j + 1      for j = 1 .. d
```

Indexed from 0 it's tidier: the children of A[i] are A[di + 1] to A[di + d], and the parent of A[i] is A[⌊(i − 1)/d⌋]. Put d = 2 in either one and you get the binary heap's formulas back. The **Array indexing** option switches the pseudocode, the narration and the index labels.

The children of a node are next to each other in the array. On a real machine they often land in the same cache line, so looking at four of them costs about the same as looking at one. That's not a Big-O fact, but it's why real priority queues often use d = 4.

## Sift up is cheap, sift down is not

Sift-up compares a key with its parent, one comparison per level. Fewer levels, fewer comparisons. [Inserts climb only a few levels](#example:insert-climbs) inserts twelve keys smallest first into a 3-ary max-heap. Every one of them climbs to the root, and none of them needs more than two comparisons.

Sift-down has to find the best of the key and its d children before it can decide to swap. That's d comparisons per level. [Extract pays d comparisons a level](#example:extract-costs-d): watch the **comparisons** counter after each extract, and compare it with the inserts.

```check
Q: In a 4-ary max-heap, the key sifting down has four children. How many comparisons does one level of sift-down make?
- 1
- 2
* 4
= It compares the best so far with each of the four children, one at a time. Only then does it know which child, if any, to swap with.
```

## Decrease-key and Dijkstra

Dijkstra's algorithm and Prim's algorithm do one extract-min per vertex but up to one decrease-key per edge. On a dense graph that's many more decrease-keys than extracts. Decrease-key in a min-heap is a sift-up, so it loves a large d. [Show me](#play:decrease-key) a 4-ary min-heap: the key in a leaf drops to 3 and reaches the root in two comparisons.

The classic choice is d ≈ m/n, the average degree. Then the m decrease-keys cost O(m log_d n) and the n extracts cost O(n d log_d n), and with that d both come to O(m log_{m/n} n). For a dense graph that's close to linear. Not bad for changing one number.

In a max-heap the same move is called increase-key. The page calls it **Update key** and sifts whichever way the new key needs.

## Building and the other variants

[Build a heap bottom-up](#example:build-bottom-up) works exactly as for binary heaps: start at the parent of the last slot and sift down back to the root. With d = 3, twelve keys have only four parents, so only four sift-downs run. Still O(n).

[Four children: a flatter tree](#example:four-children) builds the same keys with d = 4, indexed from 0. Compare its height and its extract with the 3-ary one.

```check
Q: You switch a heap from d = 2 to d = 8. What happens to the cost of insert in the worst case?
* It goes down: log₈ n levels instead of log₂ n
- It goes up: eight children to compare on each level
- It stays the same
= Insert only sifts up, and sift-up makes one comparison per level. Eight children per node means a third of the levels.
```

## When to use one, and when not to

Use a d-ary heap when inserts or decrease-keys far outnumber extracts (shortest paths on dense graphs, event queues that are mostly scheduling), or when the heap is big enough that cache misses matter. d = 4 is a good default in practice.

Avoid a large d when you extract a lot: heap sort with d = 8 does more comparisons than with d = 2. And if you need to merge two heaps, no array heap helps; have a look at the [leftist heap](/leftist-heap/) or the [pairing heap](/pairing-heap/).

## Common mistakes

- Using the binary formulas. parent(i) = ⌊i/2⌋ is only right for d = 2.
- Stopping sift-down at the first child that beats the key. You need the best child, or the heap order breaks between siblings.
- Starting build at ⌊n/d⌋. The last parent is parent(n): for n = 14 and d = 3 that's A[5], and ⌊14/3⌋ = 4 skips it.
- Counting levels only. A flatter tree with d = 16 extracts slowly: 16 comparisons on each of its few levels.

## Try this

- [Inserts climb only a few levels](#example:insert-climbs). Now set d = 2 in the options and run it again. How many comparisons does the last insert make now?
- [Extract pays d comparisons a level](#example:extract-costs-d). Predict the counter before each extract finishes.
- [Decrease-key climbs a short path](#example:decrease-key). Before each swap, say which key is the parent.
- Pick **Ascending inserts** with 13 keys, once with d = 2 and once with d = 5. Which one ends taller, and which one's last insert costs more?
