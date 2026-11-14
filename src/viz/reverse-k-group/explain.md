# Reverse a list in groups of k

Turn 1 2 3 4 5 6 7 8 into 3 2 1 6 5 4 7 8: every group of three turned around, and the last two, too few for a group, left alone. You already know how to reverse a whole list with three pointers, prev, cur and next ([the linked list page](/linked-list/) does it). This is the same loop, run once per group, plus the bookkeeping to stitch each group back in. Nothing is copied: the nodes move, their values go with them.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| find a group | walk k nodes from `before` to `kth` | Θ(k) |
| turn it around | prev, cur, nxt, with prev starting at the node after the group | Θ(k) |
| link it in | `before.next = kth`, then `before` moves to the group's new last node | O(1) |
| the whole list | every group in turn | Θ(n) time, O(1) space |
| copy to an array | copy the values, reverse each group by swaps, write them back | Θ(n) time, Θ(n) space |

The **Approach** option switches to the naive way: copy to an array. Both give the same order. The variables count the work: a `hop` sets a pointer from a next field (`kth = kth.next`, `nxt = cur.next`), a `link` writes a next field, a `copy` writes a value into an array cell or a node. `naive total` and `pattern total` say what each costs on this list. [Show me](#play:groups-of-three)

## How it works

Put a dummy node in front of the head, and a pointer `before` on it: `before` is always the node just before the next group. Then, for each group:

1. walk `kth` k nodes from `before`. If the list runs out first, the group is short: stop;
2. note `after = kth.next`, the first node of the next group;
3. turn the group around with prev, cur and nxt, but start prev at `after`, not at null;
4. `before.next = kth`: the group's old last node is its new first;
5. `before` moves to the group's old first node, which is now its last.

Step 3 is the clever bit. Reversing a whole list starts prev at null, because the old first node becomes the end. Here the old first node isn't the end; the rest of the list is. Starting prev at `after` makes the group's new last node point at the rest, so no extra link is needed later.

In [Groups of 3, a short group left as it is](#example:groups-of-three): kth walks 1, 2, 3. after is 4. Turning 1 2 3 around makes 1 point at 4, 2 at 1, 3 at 2. Then dummy.next = 3, and before moves to 1. The list now reads 3 2 1 4 5 6 7 8, and the nodes slide into their new order. The second group, 4 5 6, goes the same way, with before on 1. The third walk finds only 7 and 8, fewer than three, so it stops. 18 hops and 8 links.

```check
Q: Reversing the group 4 5 6 in 3 2 1 4 5 6 7 8 with k = 3. Where does prev start, and what does 4 point at when the group is done?
- prev starts at null; 4 points at null
- prev starts at 1; 4 points at 1
* prev starts at 7; 4 points at 7
- prev starts at 6; 4 points at 5
= prev starts at after, the node after the group: 7. The first node turned around, 4, points at prev, so it points at 7 and the rest of the list hangs off it.
```

## Why the dummy

The first group is special without one: it has no node before it, so instead of `before.next = kth` you would write `head = kth`. With a dummy every group, the first included, has a node before it. Return `dummy.next` at the end. It's the same trick as the dummy head of [merging sorted lists](/merge-sorted-lists/).

## The short last group

Problems differ on the leftovers. Some say a last group shorter than k stays as it is; others say reverse it too. The **A last group shorter than k** option switches. [The short last group reversed too](#example:short-group-reversed) turns 7 8 around as well: 3 2 1 6 5 4 8 7. Read the problem statement twice here. The code change is one line.

The edge cases are all versions of the same thing. [k = n](#example:whole-list) is one group, the whole list reversed: 5 4 3 2 1. [k longer than the list](#example:k-longer-than-list) is one short group, so with the default nothing changes: 4 hops and done. k = 1 turns every node around on its own, which changes nothing. [Groups of 2](#example:exact-multiple) swaps neighbours: 2 1 4 3 6 5. It often shows up as a problem of its own; it's the same code.

```check
Q: Reverse 1 2 3 4 5 6 7 in groups of 3, with a short last group left as it is. What is the result?
- 7 6 5 4 3 2 1
* 3 2 1 6 5 4 7
- 3 2 1 4 5 6 7
- 3 2 1 7 6 5 4
= Two whole groups, 1 2 3 and 4 5 6, are turned around. 7 is alone, fewer than three, so it stays last.
```

## Copying to an array

The naive way: copy the values into an array, reverse each group there by swapping its ends inward, then write the values back into the nodes. [Copy to an array instead](#example:copy-to-array) gets the same 3 2 1 6 5 4 7 8, with 16 hops and 20 copies: 36 against 26. Both are Θ(n). The pattern saves the array, n cells.

There's a second difference you can see in the drawing. The naive way keeps every node where it was and moves the values; the pattern moves the nodes. If anything else holds a pointer to a node (a map from keys to nodes, say, as in an [LRU cache](/lru-cache/)), only the pattern keeps that pointer pointing at the same value. And when the values are big records rather than numbers, copying them is the slow part.

## Spot it

Reach for this pattern when a problem says:

- **reverse**, **turn around** or **swap**, on part of a **linked list**: a block, every k nodes, positions i to j;
- **change the links, not the values**, or **O(1) extra space**;
- **every two neighbours**: that's k = 2.

Three problems of our own:

- A train is a singly linked list of cars. Turn each run of 4 cars around; a run of fewer than 4 at the back keeps its order. (k = 4.)
- Dancers stand in a singly linked line. The first trades places with the second, the third with the fourth, and so on, by relinking. (k = 2.)
- A to-do list is singly linked. Put items 3 to 7 in the opposite order and leave the rest alone, with no second list. (One group: before is item 2.)

Look-alikes: reversing an **array** is two indices swapping from both ends. "Does the list read the same both ways" reverses half a list, but the trick there is finding the middle with [fast and slow pointers](/fast-slow-pointers/).

## When to use it

Use it on singly linked lists when the order must change in place, or nodes must keep their identity. On an array, reverse each block with two indices; it's simpler and just as fast. On a doubly linked list, remember the prev pointers need turning around too.

## Common mistakes

- Starting prev at null for every group. The group's new last node then points at nothing, and the rest of the list is lost.
- Forgetting to move `before`, so every group is linked after the dummy.
- Moving `before` to `kth` instead of the group's old first node. kth is now the group's first node, not its last.
- Reversing the short last group when the problem says to leave it, or the other way round.
- Walking to kth after reversing has started, when the next pointers already point back. Find kth and after first.
- Returning `head`. The old head is in the middle of the first group now; return `dummy.next`.

## Try this

- [Groups of 3](#example:groups-of-three): before each group is linked in, say what the list will read.
- Switch **A last group shorter than k** and play [the same list](#example:short-group-reversed). Which nodes move?
- Type 4 and press Reverse in groups on 1 2 3 4 5 6 7 8. Then try 8, and 9.
- Press Compare, pick this page with other options, and set one side to copy to an array. Watch `copies` on one side and `links` on the other.
- [Groups of 2](#example:exact-multiple): count the links. How many per group?
