# Heap sort

Selection sort finds the largest value by looking at all of them, and it does that n − 1 times. Heap sort finds it with a heap. First it rearranges A into a max-heap, so the largest value sits at the root. Swap the root to the end of the array, where it belongs, and the heap is one slot smaller. One sift-down fixes the heap in O(log n), and you repeat. The heap and the sorted part share one array, so heap sort needs no extra memory at all.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts the n values in A, in place | O(n log n) |
| `buildMaxHeap(A, n)` | Phase 1: turns A into a max-heap | O(n) |
| `maxHeapify(A, i)` | Sifts A[i] down until neither child is bigger | O(log n) |

Phase 1 builds the heap. Phase 2 runs `last` from n down to 2: swap the root with `A[last]`, take that slot out of the heap, and sift the new root down. Each round the heap loses its last slot and the sorted part gains it. [Show me](#play:build-bottom-up)

The picture draws A twice. The tree on top is the heap, stored the way the binary heap page stores one: the children of `A[i]` are `A[2i]` and `A[2i + 1]`. The bars underneath are the whole array, with the sorted part shaded. A swap moves a value in both pictures, and a value that leaves the heap fades out of the tree.

CLRS starts the array at `A[1]`. Start at 0 and the children of `A[i]` are `A[2i + 1]` and `A[2i + 2]`; the code tabs do that, since Python, Java and C++ arrays start at 0. The **Array indexing** option switches the drawing, the narration and the pseudocode.

## Phase 1: build a max-heap

The values are already in the array; they just aren't in heap order. The slots after ⌊n/2⌋ are leaves, and a leaf on its own is already a heap. So `buildMaxHeap` starts at i = ⌊n/2⌋ and walks back to the root, sifting each value down. By the time it gets to slot i, both subtrees under i are heaps, so one sift-down makes the subtree at i a heap too.

That's O(n), not O(n log n). Half the values are leaves and never move, a quarter can sink at most one level, an eighth at most two. Only the root can sink all the way down. [Build a max-heap from the bottom up](#example:build-bottom-up) sifts five of its ten values and makes 7 swaps.

```check
Q: A holds 10 values, indexed from 1. Which call does buildMaxHeap make first?
- maxHeapify(A, 10)
- maxHeapify(A, 1)
* maxHeapify(A, 5)
- maxHeapify(A, 9)
= A[6..10] are leaves, and a leaf is already a heap. The last node with a child is A[⌊10/2⌋] = A[5], and the loop walks back from there to the root.
```

## Phase 2: swap, shrink, sift

The root is the largest value in the heap, and its final slot is `A[last]`, the end of the heap. Swap them and subtract 1 from heapSize. The value that lands on the root came from the bottom of the heap, so it's probably small. Sift it down: compare it with the larger child, swap if the child is bigger, and carry on from there. Each round costs O(log n), and there are n − 1 rounds.

heapSize is what keeps the sorted part safe. `maxHeapify` only looks at children up to heapSize, so the values past it never move again. Forget to shrink the heap and the next sift-down happily pulls the largest value back to the top.

## O(n log n), whatever the order

The order of the input barely matters. [Reverse sorted](#example:reverse-input) input is a max-heap already, since every value is at least as big as everything after it, so phase 1 makes no swaps at all. Phase 2 doesn't care: 18 comparisons and 11 swaps for 7 values. [Sorted input](#example:sorted-input) is upside down for a max-heap, and every value sinks to a leaf in phase 1. 21 comparisons and 16 swaps. Over all 5,040 orders of seven distinct values, heap sort makes 19.8 comparisons on average, never fewer than 16 and never more than 22.

That's the selling point: O(n log n) in the worst case, like merge sort, and no extra array, unlike merge sort. Many C++ libraries use it as a safety net: their `std::sort` is introsort, a quicksort that switches to heap sort when the recursion gets too deep.

Equal values are the one exception. A child that is not bigger never swaps, so with [all values equal](#example:all-equal) nothing sinks and the sort is O(n): 15 comparisons and 6 swaps for 7 values.

## Not stable

The swap from the root to the end jumps a value over everything in between, equal values included. [Equal values can change order](#example:not-stable) starts with 9 7 7 3 5 1, a max-heap already. In the first round the two 7s tie, and the tie goes to the left one, the 7 that started in `A[2]`. It leaves the heap next and takes `A[5]`, so the other 7 ends up in front of it.

```check
Q: Heap sort runs on 5, 5, 3. Which 5 comes first in the sorted array?
- The one that started first
* The one that started second
- They stay in their original order
= Phase 1 changes nothing. Phase 2 swaps the first 5, the root, into A[3]. The second 5 rises to the root and goes to A[2], in front of it.
```

## When to use it

Use heap sort when you need a guaranteed O(n log n) and can't spare O(n) extra memory: embedded code, real-time code, or the fallback inside introsort. It's also handy when you only want the k largest values: build the heap in O(n) and stop phase 2 after k rounds, O(n + k log n).

Avoid it when you need a stable sort, or when the data is nearly sorted; insertion sort is close to O(n) there, and heap sort shuffles it all anyway. On random data quicksort is usually faster in practice. Each sift-down jumps from i to 2i to 4i, all over the array, and memory caches don't like that.

## Common mistakes

- Building the heap with n inserts. It works, but it's O(n log n). The bottom-up build is O(n).
- Forgetting to shrink the heap. The sorted values get pulled back into it.
- Sifting down with the smaller child. That puts a small value above a bigger one.
- Mixing up the formulas. With the array starting at 0, the children of i are 2i + 1 and 2i + 2.
- Using a min-heap and expecting ascending order. Swapping the smallest value to the end sorts largest first.
- Claiming heap sort is stable. Try 5, 5, 3.

## Try this

- [Build a max-heap from the bottom up](#example:build-bottom-up). Before phase 1 ends, predict which value ends up at the root, and where 4 lands.
- [Sorted input](#example:sorted-input), then [reverse sorted](#example:reverse-input). Compare the counters when phase 1 ends, and again at the end.
- [Equal values can change order](#example:not-stable). Find the round where the two 7s swap places.
- [All values equal](#example:all-equal). Count the comparisons each round.
- Load 20 random values and set the detail level to **Milestones**. Each step is one round of phase 2: the heap shrinks from the right while the sorted part grows.
