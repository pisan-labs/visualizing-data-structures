# Fast and slow pointers

A singly linked list only goes one way, and it doesn't tell you how long it is. So how do you find the node in the middle? The obvious answer counts the nodes, then walks again to n / 2. The trick walks once: two pointers start at the head, one moves a node at a time, the other two. When the fast one runs out of list, the slow one has gone half as far.

The same idea, with a gap instead of a speed, finds the k-th node from the end. And with a bit of pointer surgery it checks whether a list is a palindrome without an array.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| middle, slow and fast | slow moves one node, fast two, until fast runs out | Θ(n), one walk |
| k-th from the end, a gap of k | fast goes k ahead, then both move together | Θ(n), one walk |
| palindrome, in place | find the middle, reverse the second half, compare, put it back | Θ(n), O(1) space |
| middle or k-th, count first | walk to the end counting, then walk again | Θ(n), two walks |
| palindrome, copy to an array | copy the values, compare from both ends | Θ(n), Θ(n) space |

The **Approach** option switches between the two pointers and the naive way: count the length first (middle, k-th) or copy to an array (palindrome). Both give the same answer. The variables count the work. A `hop` sets a pointer from a next field (`fast = fast.next.next` is two hops), a `link` writes a next field, a `copy` writes a value into an array cell, a `comparison` compares two values. `naive total` and `pattern total` say what each approach costs on this list. [Show me](#play:odd-middle)

## The middle

Both pointers start at the head. Each round, `slow = slow.next` and `fast = fast.next.next`. Keep going while fast can move two nodes: `while fast != null and fast.next != null`. After r rounds slow is r nodes in and fast is 2r, so when fast hits the end, slow is at the middle.

In [Slow stops at the middle](#example:odd-middle) the list is 3 8 1 9 4 7 2. Three rounds: slow goes 8, 1, 9 and fast goes 1, 4, 2. Now fast is on the last node, so it can't move two. Slow is on 9, index 3, the middle of 7. That took 9 hops.

An even count has two middles. With 3 8 1 9 4 7, the middles are 1 and 9. The loop above stops at the second, 9: on the third round fast steps past the last node to null ([Two middles: the second](#example:two-middles)). Change the condition to `while fast.next != null and fast.next.next != null` and fast stops one node early, so slow stops on the first middle, 1 ([Two middles: the first](#example:first-of-two)). The **Of two middles** option switches the loop. Neither is wrong. Read the problem and pick one. The palindrome check below works with either. Merge sort on a list wants the first, so that a list of two splits into one and one when you cut after slow.

```check
Q: The list has 8 nodes, and the loop is `while fast != null and fast.next != null`. At which index does slow stop?
- 3
* 4
- 7
- 8
= Four rounds: fast goes to index 2, 4, 6 and then 8, which is past the end (null). Slow goes 1, 2, 3, 4. Of the two middles, 3 and 4, this loop stops on the second.
```

## A gap of k

To find the k-th node from the end, move fast k nodes ahead of the head first. Then start slow at the head and move both one node at a time. The gap stays k. When fast falls off the end, slow is k nodes from it.

In [A gap of k](#example:gap-of-k), k = 3 on 3 8 1 9 4 7 2. Fast goes 8, 1, 9. Then both move four times: slow ends on 4, fast on null. The 3rd node from the end is 4. If the list is shorter than k, fast runs out while making the gap and the answer is null: [k longer than the list](#example:k-too-big) gives up after 4 hops.

Problems rarely want that node itself. Removing the k-th from the end needs the node before it, and rotating a list right by k cuts just before it. Start slow at a dummy node in front of the head and it stops one node earlier, on the node before. The gap is the useful part.

## Same work, one walk

Is this faster than counting first? Not really. Count the hops.

The middle: counting first walks the 7 nodes (7 hops) and then 3 more, 10 in all ([Count first, then walk](#example:count-first)). Slow and fast take 3 rounds of 3 hops, 9 in all. On 6 nodes it's 9 against 9. The k-th from the end is exactly the same both ways, 2n − k hops: 11 and 11 for k = 3 on 7 nodes.

So what does the pattern buy? One walk instead of two, and no need to know n. That matters when the list is a stream you can only read once, when walking is slow (nodes spread over memory, or over a network), and it matters a lot when the list might not end at all. Counting the length of a list with a cycle never finishes. Slow and fast still work there: that's [cycle detection](/floyd-cycle/), the same two speeds, where the hare laps the tortoise.

## A palindrome, in place

Does 1 2 3 4 3 2 1 read the same both ways? With an array it's easy: compare the ends and move inward. A list can't walk backwards. So turn the second half around:

1. find the middle with slow and fast;
2. reverse the list from slow on, as on [the linked list page](/linked-list/);
3. walk `left` from the head and `right` from the old last node, comparing;
4. reverse the second half again, so the list is back as it was.

In [A palindrome, checked in place](#example:palindrome-in-place), slow stops on 4. The four nodes 4 3 2 1 are turned around, so 1 points back at 2, 2 at 3, 3 at 4, and 4 at null. Left and right meet in the middle: 1 = 1, 2 = 2, 3 = 3, then 4 against itself. Yes. Then the four links are put back.

Here's the honest part. That costs 25 hops, 8 links and 4 comparisons, 37 in all. Copying to an array costs 7 hops, 7 copies and 3 comparisons, 17 ([Copy to an array instead](#example:palindrome-array)). The pattern does more than twice the work. What it saves is the array: n cells against none. When an interview says "O(1) extra space", this is why.

[Not a palindrome](#example:not-a-palindrome) stops comparing at 3 ≠ 4, and still restores the list. Forget step 4 and you hand back a list cut in half: the first half still ends at the middle node, but the middle node now points at null.

```check
Q: Checking 1 2 3 2 1 in place, slow stops on 3 and the second half 3 2 1 is reversed. Following next from the head now gives what?
- 1 2 3 2 1
* 1 2 3
- 1 2 3 1 2
- 3 2 1
= The first half is untouched, so 2 still points at 3. But 3 was the first node reversed: it points at null now. The list from the head is 1 2 3 until the second half is put back.
```

## Spot it

Reach for fast and slow pointers when a problem says:

- **singly linked**, and asks about a position: the **middle**, the **k-th from the end**, the node **before the last k**;
- **one pass** or "without counting", or the length is unknown;
- **O(1) extra space** on a list question, especially "reads the same both ways";
- a sequence that **might loop** (each value comes from the one before): that's cycle detection.

Three problems of our own:

- A playlist is a singly linked list. Return the song in the middle in one walk. (Slow and fast.)
- A printer queue is a singly linked list. Remove the job 3 places from the end. (A gap of 3, and keep the node before it.)
- Rotate a list right by k: the last k nodes move to the front. (A gap of k finds the cut; three links finish it.)

Look-alikes: a sorted **array** and "two values that add up to x" is [two pointers](/two-pointers/) from both ends, which a list can't do. "Combine two sorted lists" is a merge.

## When to use it

Use it on singly linked lists, where you can't index and can't walk back. On an array, skip it: `a[n / 2]` and `a[n − k]` are O(1). Use the in-place palindrome when memory is the point; when it isn't, the array version is half the work and much harder to get wrong. And if other code may be reading the list while you check, don't reverse half of it, even for a moment.

## Common mistakes

- Testing only `fast != null`, then crashing on `fast.next.next`.
- Picking the wrong middle for an even count. Decide which one the problem wants, then pick the loop.
- An off-by-one in the gap: moving fast k − 1 or k + 1 ahead. With k = 1 the answer is the last node; check that case by hand.
- Forgetting a list shorter than k. Fast hits null while making the gap.
- Not restoring the list after the palindrome check.
- Thinking the pattern saves work. It saves a walk, the length, and (for the palindrome) the array.

## Try this

- [Slow stops at the middle](#example:odd-middle): before you play it, guess where fast is when it stops.
- [Two middles: the second](#example:two-middles), then switch **Of two middles** and play it again.
- Press Compare, pick this page with other options, and set one side to count first. Fill a list of 10 and find the middle on both. Which takes more hops?
- [k longer than the list](#example:k-too-big): type 4 and press k-th from end. What comes back?
- Build `1 2 2 1` and press Palindrome?. Where does slow stop, and how many comparisons are made?
