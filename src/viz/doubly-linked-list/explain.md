# Doubly linked list

A doubly linked list gives every node two pointers: `next` to the node after it and `prev` to the node before it. That costs one extra pointer per node. In return you can walk the list in both directions, and you can remove a node you are holding without hunting for the node before it.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `insertHead(x)`, `insertTail(x)` | Put `x` at either end | O(1) |
| `insertAt(i, x)` | Put `x` so it ends up at index `i` | O(n) |
| `removeHead()`, `removeTail()` | Remove from either end | O(1) |
| `removeAt(i)` | Remove the node at index `i` | O(n) to find it, O(1) to unlink |
| `removeValue(x)`, `search(x)` | Find `x` front to back | O(n) |
| `get(i)` | Value at index `i` | O(n), at most about n / 2 hops |
| `reverse()` | Swap `next` and `prev` in every node | O(n) |

Compare `removeTail` with the singly linked list. There it is O(n), even with a tail pointer, because nobody knows which node comes before the last one. Here the last node's `prev` says so. [Show me](#play:remove-ends).

## Four pointer updates

Linking a new node in between `pred` and `succ` changes four pointers:

```
new.next = succ
new.prev = succ.prev
succ.prev.next = new
succ.prev = new
```

The first two only touch the new node, so the list does not change yet. The last two hook it in, and their order matters. `succ.prev.next = new` reaches `pred` through `succ.prev`, so it has to run while `succ.prev` still means `pred`. Do `succ.prev = new` first and `succ.prev.next = new` makes the new node point at itself. [Show me](#play:four-updates).

```check
Q: Inserting before succ, what happens if succ.prev = new runs before succ.prev.next = new?
- Nothing, the order does not matter
* The new node ends up pointing forward at itself, and pred never learns about it
- The list loses succ and everything after it
= After succ.prev = new, succ.prev.next means new.next. pred still points at succ, and the new node points at itself.
```

Removing a node takes four updates too. Two route around it (`cur.prev.next = cur.next` and `cur.next.prev = cur.prev`), and two clear its own pointers. The list does not need the last two, but they stop a removed node from pointing back into the list. Java's `LinkedList` clears them as well.

## Sentinels

Without a sentinel, every one of those updates comes with an if statement. Is the list empty? Is this the first node, so `head` changes? The last, so `tail` changes? Switch the **Ends of the list** option to head and tail pointers and the pseudocode grows the ifs right in front of you.

CLRS gets rid of all of them with one extra node, a sentinel called `nil`. It holds no value. `nil.next` is the first node and `nil.prev` the last, and the list is circular through it. An empty list is `nil` pointing at itself both ways. Now every real node always has a real node, or `nil`, on both sides, so linking and unlinking never meet a null pointer. The loops stop when they get back to `nil` instead of at null.

The price is one node of memory and a little care: `nil` is not data, so do not count it, print it or search it. [Without a sentinel: head, tail and if statements](#example:no-sentinel) runs the plain version.

```check
Q: In a doubly linked list with a sentinel nil, what does an empty list look like?
- nil.next and nil.prev are both null
* nil.next and nil.prev both point at nil
- There is no nil until the first insert
= The sentinel is always there. With no real nodes, the first node and the last node are nil itself.
```

## Walking from the nearer end

With `prev` pointers you can walk backwards, so `get(i)` starts from whichever end is closer. Index 6 of 8 is one hop back from the last node instead of six hops forward from the first. Java's `LinkedList` does the same. It halves the walk, but halving is still O(n). [get(i) walks from the nearer end](#example:nearer-end).

## Reversing

Reversing a doubly linked list is simpler than reversing a singly linked one: every node swaps `next` and `prev`, then `head` and `tail` swap (or, with a sentinel, `nil` swaps its own two). One temporary pointer is enough. The drawing turns each node around as it is swapped and marks it green, so you can see the reversed part grow. [Show me](#play:reverse).

## When to use one

Use a doubly linked list when you need both ends, or when you hold pointers to nodes and want to remove them in O(1). A deque fits, and so does an LRU cache, where a hash map finds the node and the list moves it to the front. Java's `LinkedList` and C++'s `std::list` are doubly linked.

Avoid it when you mostly read by index. `get(i)` is still a walk, the nodes are scattered around memory, and every node now carries two pointers on top of its value. For a list of small numbers that is more pointer than data.

## Common mistakes

- Running the last two updates of an insert in the wrong order.
- Updating `next` but forgetting `prev`. The list still works forward, so the bug hides until something walks backwards.
- Forgetting the special cases without a sentinel: the empty list, the first node and the last node.
- Treating the sentinel as data: counting it, printing it, or returning its value.
- Checking for null in a sentinel list. The loop has to stop at `nil`.

## Try this

- [Four pointer updates per insert](#example:four-updates). Before each update, say which arrow will move.
- [Remove from either end without walking](#example:remove-ends). Then run the same operations on the singly linked list page.
- [The empty list and the one-node list](#example:empty-and-one). With one node, `nil.next.prev = new` is the line that sets `nil.prev`.
- [Without a sentinel](#example:no-sentinel). Count the if statements.
- Switch the **Ends of the list** option and replay the same example. The result is the same; the pseudocode is not.
