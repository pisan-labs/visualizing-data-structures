# Binary heap

A priority queue hands back the most important item first. Not the oldest, not the newest: the one with the highest priority. Operating systems pick the next job this way, simulations pick the next event this way, and Dijkstra's algorithm picks the next vertex this way.

A binary heap is the usual way to build one. It's a binary tree with one rule: every parent is at least as big as its children. That's a max-heap; flip the rule and you get a min-heap. The rule says nothing about left and right, so a heap is much lazier than a binary search tree. It only promises that the biggest key is at the root. It turns out that's enough.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `insert(key)` | Add a key | O(log n) |
| `extractMax()` | Remove and return the largest key | O(log n) |
| `maximum()` | Return the largest key and leave it there | O(1) |
| `build(list)` | Turn a list of keys into a heap | O(n) |
| `updateKey(i, key)` | Change the key in slot i | O(log n) |
| `delete(i)` | Remove the key in slot i | O(log n) |

Everything that changes the heap walks one path between the root and a leaf, and a heap with n keys is only ⌊log₂ n⌋ levels deep. Build is the surprise: O(n), not O(n log n). More on that below.

## A tree in an array

A heap is always a complete tree: every level is full except the bottom one, which fills from the left. A complete tree has no gaps, so it fits in an array with no pointers at all. Read the tree level by level, left to right, and you have the array.

CLRS starts the array at `A[1]`. The root is `A[1]`, and for the key in slot i:

- its parent is in slot ⌊i/2⌋;
- its children are in slots 2i and 2i + 1.

Most languages start arrays at 0, and then the formulas shift: the parent of slot i is ⌊(i − 1)/2⌋ and the children are 2i + 1 and 2i + 2. Python's `heapq` and Java's `PriorityQueue` both work this way, and both are min-heaps. C++'s `std::priority_queue` is a max-heap. The **Array indexing** option switches the drawing, the narration and the pseudocode. [A min-heap indexed from 0](#example:min-heap-zero-based).

Each key is drawn twice, once in the tree and once in the array, with its index under it. When a key moves, it moves in both pictures.

```check
Q: The array starts at A[1]. Which slot holds the parent of A[9]?
- A[3]
* A[4]
- A[5]
- A[8]
= ⌊9/2⌋ = 4. Going the other way, the children of A[4] are A[8] and A[9].
```

## Insert: sift up

The new key goes in the first free slot, right after the last key. That keeps the tree complete, but the new key might be bigger than its parent. So compare it with its parent and swap them if the parent is smaller. Repeat until the parent is at least as big, or the key reaches the root. This is sift-up. You'll also see bubble up, percolate up and swim; same thing.

[Show me](#play:insert-to-root) a key that is bigger than everything in the heap. It swaps at every level and ends at the root, which is the O(log n) worst case. Most inserts are cheaper. On random keys a new key usually stops after a level or two.

## Extract: sift down

The largest key is at the root, so finding it is free. Removing it leaves a hole at the top. The trick is to move the last key into the root and shrink the heap by one. The tree is complete again, but the new root came from the bottom row and is probably too small. Compare it with its children. If the larger child beats it, swap them, and carry on from the child's slot. CLRS calls this `MAX-HEAPIFY`; sift-down, percolate down and sink are the other names.

Swap with the larger child, always. Swap with the smaller one and you've just put a small key above a bigger one.

[Extract until empty](#example:extract-until-empty) keeps extracting, and the keys come out in order, largest first. That's [heap sort](/heap-sort/), minus the trick that does it inside one array. [Show me](#play:extract-until-empty).

## Build a heap: two ways

You have n keys and you want a heap. The obvious way is to insert them one at a time. Each insert costs O(log n), so that's O(n log n), and it really does cost that when the keys arrive in the wrong order. For a max-heap, ascending order is the worst: every new key is the largest so far, so every one climbs to the root.

The better way works bottom-up. Copy the keys into the array as they are. The slots after ⌊n/2⌋ hold leaves, and a leaf on its own is already a heap. So start at i = ⌊n/2⌋ and walk back to the root, sifting each key down. By the time you get to slot i, both subtrees under it are heaps, so one sift-down makes the subtree at i a heap too.

Why is that O(n)? Most of the keys are near the bottom, where sifting down is short. Half of them are leaves and never move. A quarter can sink at most one level, an eighth at most two, and so on. Add it all up and you get fewer than n swaps, whatever order the keys start in. Only one key, the root, can sink all the way down.

Build the same twelve keys both ways and watch the counters. [Bottom-up](#example:build-bottom-up) takes 16 comparisons and 9 swaps. [One insert at a time](#example:build-by-inserts) takes 25 and 25. The **Build heap** option switches between the two; change it and the same operations replay the other way. [Show me](#play:build-bottom-up).

```check
Q: A bottom-up build on 12 keys, counting from 1, starts its loop at i = 6. Why not at i = 12?
- Slots 7 to 12 are already sorted
* Slots 7 to 12 are leaves, and a leaf on its own is already a heap
- Starting at 12 would run past the end of the array
= A leaf has no children, so there is nothing for it to be out of order with. Starting at ⌊n/2⌋ skips half the keys for free.
```

## Changing a key, deleting a key

Dijkstra's and Prim's algorithms keep changing priorities as they run, so a heap often needs `updateKey`. Change the key in slot i, then ask which way it moved. In a max-heap, a key that grew can only clash with its parent, so sift it up. A key that shrank can only clash with its children, so sift it down. Never both. [Update a key up, then down](#example:update-both-ways).

There's a catch: you have to know which slot the key is in. The heap can't tell you, because searching a heap is O(n). Real implementations keep a separate map from items to slots and update it on every swap.

Deleting slot i works like extract. Move the last key into the gap and shrink the heap. Then the key in the gap may have to go down, or up. Up surprises people. [Show me](#play:delete-sifts-up): 85 comes from the other side of the tree, lands under 50, and has to climb. Think of delete as an update: the key in slot i changes from the deleted key to the last key. Compare the two and you know which way to sift.

## When to use one, and when not to

Use a heap when you keep asking for the smallest (or largest) item while new items keep arriving: scheduling, event simulation, Dijkstra, Prim, merging sorted lists, keeping the top k of a stream. You get the extreme in O(1), insert and remove in O(log n), all in one array with no pointers.

Don't use a heap to search; finding an arbitrary key means looking at every slot. Don't use one if you need all the keys in sorted order all the time; a balanced search tree keeps them sorted. And merging two binary heaps means building a new one from scratch, which is O(n). [Leftist](/leftist-heap/), [skew](/skew-heap/), [binomial](/binomial-queue/) and [Fibonacci](/fibonacci-heap/) heaps exist mostly because of that.

## Common mistakes

- Mixing up the 0-based and 1-based formulas. With the array starting at 0, the parent of i is ⌊(i − 1)/2⌋, not ⌊i/2⌋. Get it wrong and the heap quietly stops being a heap.
- Swapping with the smaller child when sifting down a max-heap.
- Forgetting that `delete(i)` may have to sift up.
- Building by repeated insertion and calling it O(n).
- Expecting the array to be sorted. A heap only promises that each parent beats its children.
- Thinking the heap where `new` gets its memory is this heap. Same name, unrelated idea.

## Try this

- [An insert that climbs to the root](#example:insert-to-root). Before pressing play, say which slots 50 passes through.
- [Bottom-up](#example:build-bottom-up), then [one insert at a time](#example:build-by-inserts). Same keys. Compare the comparisons and swaps when each one finishes.
- [Delete from the middle can sift up](#example:delete-sifts-up). Why does 85 go up and not down?
- [A min-heap indexed from 0](#example:min-heap-zero-based). Check each parent with ⌊(i − 1)/2⌋.
- Start over with **Ascending** and 15 keys, then switch **Build heap** in Options. Set the detail level to **Every detail** to see every comparison.
