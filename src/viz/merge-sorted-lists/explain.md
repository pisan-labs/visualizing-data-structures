# Merge sorted lists

Two linked lists, each already sorted. Make one sorted list out of them. The lazy answer copies every value into an array, sorts it and builds a new list. That throws away the one thing you were given: both lists are in order already. So the next node of the answer is always one of the two front nodes. Compare them, take the smaller, repeat. Nothing is copied and no node is made: the merge just relinks the nodes you have.

It's the merge from [merge sort](/merge-sort/), on [linked lists](/linked-list/), where it is even cheaper: once one list runs out, the rest of the other is linked with one pointer.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| merge two lists, dummy head | link the smaller front after tail, move on in its list | O(m + n), O(1) space |
| k lists, in pairs | A with B, C with D, then the results, until one is left | O(N log k) |
| k lists, one at a time | A with B, then that with C, then with D | O(N k) |
| copy to an array, sort, rebuild | ignore the order you were given | O(N log N) with a good sort, Θ(N) space |

N is the number of nodes in all the lists together. The **Approach** option switches to the naive way. Both give the same list; the pattern reuses the nodes, the naive way makes new ones. The variables count the work: `comparisons` between two values, `links` (next fields written) and `copies` (values written into an array cell or a new node). `naive total` and `pattern total` say what each approach costs on these lists. [Show me](#play:two-lists)

## The dummy head

Start the answer with a dummy node, a fake head, and a pointer `tail` on it. Then:

1. while both lists have nodes, compare the fronts `a` and `b`;
2. link the smaller after tail (`tail.next = a`), move on in that list (`a = a.next`), and move tail onto the node just linked;
3. when one list is used up, link the rest of the other: `tail.next = a or b`;
4. return `dummy.next`.

Why the dummy? Without it the first node is special: there is no tail yet to link it after, so you need an `if` for an empty result. With it, every node is linked the same way, and the dummy is thrown away at the end.

In [Two sorted lists, one dummy head](#example:two-lists), A = 1 4 7 9 and B = 2 3 8. The fronts are 1 and 2: take 1. Then 4 against 2, 4 against 3, 4 against 8, 7 against 8, 9 against 8. B is used up after six comparisons, and 9 is linked at once. 6 comparisons, 7 links, no copies. Watch the nodes: each one drops from its list's row into the out row, and for a moment its next pointer still points back into the list it came from. That pointer is fixed by the next link.

```check
Q: Merging A = 1 2 3 with B = 5 7 8 9, how many comparisons are made?
- 1
* 3
- 6
- 7
= 1, 2 and 3 are each compared with 5 and taken. Then A is used up, and the rest of B, 5 7 8 9, is linked with one pointer. No more comparisons.
```

## How much work

The merge makes one comparison per node it takes while both lists still have nodes. So it makes at most m + n − 1 comparisons, when the values interleave: [Interleaved](#example:interleaved) takes 9 for 10 nodes. At best it makes min(m, n), when one list is all smaller: [One list runs out](#example:rest-at-once) takes 3. An empty list is the extreme case: [Merging with an empty list](#example:empty-list) makes no comparisons and one link.

The naive way on the same 7 nodes as above: 7 copies into an array, an insertion sort with 13 comparisons and 13 more copies, then 7 new nodes and 7 links. 47 in all, against 13 ([Copy, sort, rebuild](#example:copy-and-sort)). This page sorts by insertion so you can watch every comparison; a good sort is O(N log N), and the built-in sorts of Python and Java (for objects) look for runs that are already in order, so they do much better here. They still need the array, and you still build new nodes.

## Ties

When the fronts are equal, take from `a`: the test is `a.value <= b.value`, not `<`. Then equal values keep their order, A's before B's. That makes the merge stable, which is what merge sort needs to be stable. In [Equal values: A's first](#example:ties-keep-order), A = 2 4 4 and B = 1 4 6: both 4s from A come before B's 4. With plain numbers you can't see the difference. With records sorted by one field, you can.

## k lists, in pairs

Now k sorted lists. Merge them in pairs: A with B and C with D, then the two results. Each round halves the number of lists, so there are about log2(k) rounds, and each round touches every node once. O(N log k).

One at a time is the obvious alternative: merge A with B, then that with C, then with D. It's simpler and slower. A's nodes are compared again in every merge. In [Four lists in pairs](#example:four-in-pairs), 1 5 9, 2 6 10, 3 7 and 4 8 take 16 comparisons. [One at a time](#example:four-one-at-a-time) takes 19. Not a big gap at 10 nodes; with k lists of the same length, one at a time is O(N k).

A min-heap of the k front nodes does the same job in one pass, also O(N log k): pop the smallest, push its successor. That is the k-way merge, with a [binary heap](/binary-heap/).

```check
Q: Eight sorted lists of 100 nodes each are merged in pairs. How many rounds, and how many times is each node part of a merge?
- 7 rounds, 7 times
* 3 rounds, 3 times
- 8 rounds, 1 time
- 1 round, 8 times
= 8 lists, then 4, then 2, then 1: three rounds, and every node is in one merge per round. One at a time, the first list's nodes would be in all 7 merges.
```

## Spot it

Reach for the merge when a problem says:

- **two sorted lists** (or arrays), and one **sorted result**;
- **"in place"**, **"reuse the nodes"** or **"without extra space"** on a list;
- **k sorted lists**, logs, feeds or streams to combine: merge in pairs, or use a heap of the fronts;
- **sort a linked list**: merge sort, split with [slow and fast pointers](/fast-slow-pointers/), then merge.

Three problems of our own:

- Two singly linked lists of timestamps, each oldest first. Make one list, oldest first, from the same nodes. (A dummy head and a tail.)
- Eight servers each keep a log sorted by time. Produce one log. (Merge in pairs: three rounds.)
- Sort a singly linked list of n numbers in O(n log n) without an array. (Merge sort: split at the middle, sort the halves, merge.)

Look-alikes: "merge overlapping meetings" is merging intervals, a different job. "The ids in both of two sorted arrays" walks two pointers the same way, but nothing is linked.

## When to use it

Use it whenever two or more inputs are already sorted: merging is linear, sorting isn't. On linked lists it needs no extra space at all. On arrays the merge needs an output array of m + n, unless one array has room at its end for the other (then merge from the back).

Avoid copying to an array and sorting unless the lists are tiny or unsorted. And for many lists, never merge one at a time into an ever-growing result; pair them up or use a heap.

## Common mistakes

- No dummy head, then a special case for the first node, then a bug in it.
- Forgetting the rest: when one list runs out, `tail.next = a or b`. Leave it out and the answer stops early.
- Walking the rest node by node to link it. It's already linked; one pointer does it.
- `<` instead of `<=` on ties, so equal values swap order and the merge is no longer stable.
- Returning `dummy` instead of `dummy.next`.
- Merging k lists one at a time and calling it O(N log k).

## Try this

- [Two sorted lists, one dummy head](#example:two-lists): before each step, say which front is taken.
- [One list runs out](#example:rest-at-once). How many nodes are linked by the last pointer?
- [Equal values: A's first](#example:ties-keep-order). Which 4 comes first in the result?
- Press Compare, pick this page with other options, and set one side to copy, sort, rebuild. Fill it with interleaved lists and watch `comparisons` and `copies`.
- [Four lists in pairs](#example:four-in-pairs), then switch **More than two lists** to one at a time and play it again.
