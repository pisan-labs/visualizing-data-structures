# LRU cache

A cache keeps a few recent answers close at hand: web pages, database rows, results of slow function calls. It has room for a fixed number of entries, so sooner or later something has to go. An LRU (least recently used) cache throws out the entry that has gone unused the longest. The bet is that what you used recently, you will use again soon.

The trick is doing that in O(1). We need to find a key fast, which sounds like a hash map. We also need to know which entry was used least recently and move an entry to the "just used" end every time we touch it, which sounds like a list. So we use both: a hash map from key to node, and a doubly linked list of the nodes in order of use. The most recently used node is at head, the least recently used at tail.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `get(k)` | Returns k's value and moves k to the front, or returns −1 | O(1) |
| `put(k, v)` | Stores v under k at the front, evicting the tail if the cache is full | O(1) |

Both are O(1) because neither ever searches the list. The map jumps straight to a node, and the list hands over its last node directly. Variables counts `hits` and `misses` (for get), and the `hit rate`.

## get: a hit moves to the front

get looks k up in the map. No entry: a miss, return −1, nothing changes. An entry: a hit, and its node x has to become the most recently used. That takes six pointer updates, and each one is a step here:

1. Unlink x: x.prev.next = x.next, and x.next.prev = x.prev (or tail moves back, if x was last).
2. Put x at the front: x.next = head, x.prev = nil, head.prev = x, and head = x.

[A hit moves the key to the front](#example:hit-moves-to-front). [Show me](#play:hit-moves-to-front). Why a doubly linked list? Unlinking x needs x's predecessor. A singly linked list would have to walk from the head to find it, which is O(n) and defeats the whole idea.

```check
Q: The cache holds 1, 2, 3 (most to least recent) and has capacity 3. You call get(3), then put(4, 40). Which key is evicted?
- 3
* 2
- 1
- None, put replaces the value of 3
= get(3) makes 3 the most recent, so the order is 3, 1, 2. The least recently used is now 2, and that's what put evicts.
```

## put: update, or evict and insert

If k is already cached, put replaces the value and moves the node to the front: writing a key counts as using it. [put on a cached key is a use too](#example:update-existing).

If k is new and the cache is full, put first evicts the tail. Unlinking the tail is the easy case of unlinking: tail = y.prev, then the new tail's next becomes nil. Then it deletes y's key from the map. That's why each node stores its key as well as its value: without the key, we couldn't find the map entry to delete. Finally it makes a node for k, adds it to the map, and links it at the front. [Evicting the least recently used](#example:evict-lru) is a cache of 2 that evicts twice.

```check
Q: Why does each node store its key, when the map already maps keys to nodes?
- So get can return the key along with the value
* So eviction can find and delete the tail's entry in the map
- So the list can be kept sorted by key
= Eviction starts from the tail node, not from a key. The node has to say which key it belongs to, or its map entry would never be deleted.
```

## Variants

- **Sentinels.** Many implementations put a dummy node at each end of the list. Then every real node has a real prev and next, and the null checks for "first" and "last" disappear. This page uses plain head and tail pointers, so you can see those edge cases. [A cache of one: head and tail are the same node](#example:one-entry) is where they bite.
- **Which end is which.** Python's `OrderedDict.move_to_end` puts the most recent entry at the end instead of the front. Same idea, mirrored.
- **Built in.** Java's `LinkedHashMap` does all of this when created with `accessOrder = true` and a `removeEldestEntry` override. Python's `functools.lru_cache` wraps a function in an LRU cache.

## When to use it, and when not to

LRU works when the recent past predicts the near future: a user clicking around the same few pages, a program touching the same records. It's simple, it's O(1), and its behaviour is easy to explain.

It fails badly on a loop that's slightly bigger than the cache. Read keys 1, 2, 3, 4, 1, 2, 3, 4… with room for three, and the key you need next is always the one you just threw out. [A loop one key too big misses every time](#example:loop-misses): the hit rate is 0. A long one-off scan has a similar problem, since it pushes everything useful out. That's one reason databases and operating systems use relatives of LRU, such as CLOCK, 2Q or ARC, and CPU caches only approximate it.

## Common mistakes

- Evicting from the list but forgetting the map. The map then points at a node that's no longer in the cache.
- Moving a node to the front without unlinking it first, which leaves two nodes pointing at it and creates a loop.
- Forgetting the cases where x is the head or the tail. With one entry, it's both.
- Updating a value in put without moving the node to the front.
- Evicting before checking whether k is already cached, so updating a key in a full cache throws out a different key for no reason.

## Try this

- [A hit moves the key to the front](#example:hit-moves-to-front). Before each step, say which pointer changes next.
- [Evicting the least recently used](#example:evict-lru). Predict every return value first.
- [A loop one key too big misses every time](#example:loop-misses). Then raise the capacity to 4 in Options and play it again.
- Fill with **A hot set of keys** (16 operations) and compare its hit rate with **Random keys**.
