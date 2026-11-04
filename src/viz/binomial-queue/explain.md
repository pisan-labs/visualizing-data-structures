# Binomial queue

A binomial queue is a priority queue built out of a list of small, very regular trees. CLRS calls it a binomial heap; Weiss and Galles call it a binomial queue. Same thing. It's a min-heap, like the leftist heap, and it merges two queues in O(log n). The difference is how it gets there: instead of one tree with a short right path, it keeps a list of trees whose sizes are powers of 2, and merging them works exactly like adding two numbers in binary.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `union(H1, H2)` | Merge two queues | O(log n) |
| `insert(key)` | Union with a one-node queue | O(log n), O(1) amortized |
| `findMin()` | Look at every root | O(log n) |
| `extractMin()` | Remove the smallest root, union its children back in | O(log n) |
| `decreaseKey(x, k)` | Lower a key and move it up | O(log n) |

Every bound here is worst case, except the one that says amortized.

## Binomial trees

A B₀ is a single node. A B_k is two B_{k−1} trees linked together: the one with the larger root becomes the leftmost child of the other. That one rule gives the trees all their properties. A B_k has exactly 2^k nodes and height k, and its root has k children, which are a B_{k−1}, a B_{k−2}, and so on down to a B₀. (The number of nodes at depth d is the binomial coefficient "k choose d", which is where the name comes from.)

Every tree keeps heap order, so the smallest key of each tree is at its root.

## One tree per 1 bit

A queue with n keys has at most one tree of each size, so it holds exactly the trees for the 1 bits of n. Thirteen keys is 1101 in binary, so the queue has a B₃, a B₂ and a B₀: 8 + 4 + 1. No choice in the matter. The number of trees is the number of 1 bits, at most ⌊log₂ n⌋ + 1.

The drawing shows n in binary above the trees, and the name of each tree above its root. The roots form a list in increasing degree.

```check
Q: A binomial queue holds 13 keys. Which trees does it have?
- B₄ and B₀
- B₃, B₁ and B₀
* B₃, B₂ and B₀
= 13 = 8 + 4 + 1 = 1101 in binary. One tree for each 1 bit.
```

## Union is binary addition

To unite two queues, merge their root lists by degree, the way [merge sort](/merge-sort/) merges two sorted lists. Then walk the list. Two trees of the same degree next to each other get linked into one tree of the next degree up. That's a carry: 1 + 1 = 10. A carry can meet two more trees of its new degree, one from each queue, and then there are three of a kind, 1 + 1 + 1 = 11: keep the first and link the other two.

[Show me](#play:union-binary): 6 keys (110) and 7 keys (111). The two B₁ trees link into a B₂, which finds two B₂ trees waiting. The first stays, the other two link into a B₃, and the result is 1101. Watch the variables: one link per carry.

CLRS writes the walk with three pointers, prev, x and next, and four cases. The drawing puts those names over the roots they point at.

## Insert, findMin and extractMin

Insert is a union with a one-node queue: adding 1. [An insert that carries all the way](#example:insert-carries): 7 keys is 111, plus 1 is 1000, so the new node links with the B₀, that B₁ links with the B₁, and that B₂ links with the B₂. Three links, one tree. That's the worst case, O(log n). Most inserts are cheap, though, because a binary counter mostly flips its last few bits. Over a run of n inserts the links add up to fewer than n, so insert is O(1) amortized.

findMin has to look at every root, since any of them could be the smallest. That's O(log n). Some implementations keep a pointer to the smallest root to make it O(1); the [Fibonacci heap](/fibonacci-heap/) does.

extractMin finds the smallest root and takes its tree out of the list. The children of a B_k are a B_{k−1}, …, B₀, which is a binomial queue all by itself once you reverse them into increasing degree. Union that queue with what's left. [Show me](#play:delete-min-children): the B₃ rooted at 10 gives up three subtrees, and they link back together with the B₀ that was already there.

```check
Q: A queue holds 15 keys. How many links does an insert make?
- 1
- 2
* 4
= 15 is 1111 in binary. Adding 1 carries through all four bits, one link each, and leaves 10000: a single B₄.
```

## decreaseKey

Lowering a key can only break heap order with the parent, so swap the key upward until its parent is smaller, the same way a [binary heap](/binary-heap/) sifts up. A B_k has height k, so that's O(log n). [decreaseKey climbs to the root](#example:decrease-bubble).

CLRS exchanges the keys rather than the nodes, and the drawing does the same: the key moves up, the nodes stay where they are. Here you name the node by its key. A real program would keep a pointer to it, since a binomial queue can't search.

## Two ways to draw it

The logical view draws each tree as a tree. The internal view draws what the nodes hold. In CLRS, every node keeps a key, a degree, a pointer to its parent, a pointer to its leftmost child, and a pointer to its next sibling. The children of a node are a list linked by sibling pointers, and so are the roots. The **Draw the trees** option switches between the two. [The same union, as pointers](#example:pointers-view). Parent pointers are left out to keep the picture readable.

## When to use one, and when not to

Use a binomial queue when you merge priority queues and need worst-case bounds, not just amortized ones. It's also the foundation for the Fibonacci heap, so it's worth knowing for that alone.

If you never merge, a binary heap is simpler and faster: one array, no pointers. If you need decreaseKey to be cheap, as in Dijkstra's algorithm on a dense graph, the Fibonacci heap does it in O(1) amortized. In practice, binary heaps win most contests.

## Common mistakes

- Linking the wrong way round. The larger root goes under the smaller one.
- Linking two trees of different degrees. Only equal degrees link.
- Forgetting the three-of-a-kind case. Keep the first tree and link the next two.
- Forgetting to reverse the children in extractMin. They come out in decreasing degree.
- Expecting findMin to be O(1). Without a pointer to the minimum, it checks every root.

## Try this

- [An insert that carries all the way](#example:insert-carries). Before each link, say which tree goes under which.
- [Union is binary addition](#example:union-binary). Write 110 + 111 on paper first, then watch.
- [extractMin](#example:delete-min-children): predict the trees left afterwards from n − 1 in binary.
- Start over with **Random keys** and 15 keys, then insert one more key. Count the links.
- Switch **Draw the trees** to the internal view in Options and replay any example.
