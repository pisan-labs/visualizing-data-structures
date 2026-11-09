# Two pointers

You have a sorted array and want two values that add up to a target. The obvious way tries every pair: n(n − 1)/2 of them, 45 for ten values. Two pointers does it with at most n − 1 checks. Put one index at each end, add the two values, and move one index in. The trick is that every move throws away a whole row of pairs at once, and we can prove none of them was the answer.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `pairSum(target)` | Two values of sorted A that add up to target | O(n) |
| `maxWater()` | The two walls that hold the most water | O(n) |
| `removeDuplicates()` | Keeps one copy of each value of sorted A, in place | O(n) |
| `reverse()` | Reverses A in place | O(n) |

The drawing shows A with lo and hi under it. For pair sum and most water, the grid beside it has one square per pair (i, j) with i < j. A dot means we added that pair. A gray square was ruled out without ever being added. The white squares that are left always form a triangle: the pairs with lo ≤ i < j ≤ hi. [Show me](#play:find-pair)

## Why each move is safe

Say A[lo] + A[hi] is smaller than the target. Every partner of A[lo] that is still in play sits between lo and hi, so it is at most A[hi]. Adding A[lo] to any of them gives at most A[lo] + A[hi], which is already too small. So A[lo] is in no answer, and lo moves right. That rules out a whole row of the grid.

Too big works the same way from the other end. Every partner of A[hi] is at least A[lo], so every pair with A[hi] is too big, and hi moves left. That rules out a column.

Each check moves a pointer one step, so there are at most n − 1 checks before lo and hi meet. On [no pair adds up](#example:no-pair) the pointers walk all the way: 9 checks, and every one of the 45 squares ends up dotted or gray. [Find a pair that adds up to 47](#example:find-pair) takes 7 checks. When the two ends already add up, [one check](#example:first-try) is enough.

```check
Q: A = 3 8 12 20 25 and the target is 30. The first check adds 3 + 25 = 28. What happens next?
- hi moves left: 25 is too big
* lo moves right: 3 is too small for every partner
- Both pointers move
= 28 < 30. The biggest partner 3 has left is 25, and even that is too small, so no pair with 3 can work.
```

This is the whole reason the array has to be sorted. On unsorted values, a sum that is too small tells you nothing about which end to move. The page refuses and asks you to sort first. [Unsorted input: sort first](#example:sort-first)

## The container with the most water

Same pointers, different question. Each value is a wall, and two walls hold min(A[i], A[j]) × (j − i). Start with the widest pair. Now look at the shorter wall. With any closer partner it is narrower and still no taller than itself, so it can never beat what we just measured. It is done, so move it in. The taller wall might still find a better partner, so it stays.

That argument does not need sorted input, which surprises people. The heights can be anything. [The container with the most water](#example:most-water) finds 49 after 8 pairs out of 36. [Show me](#play:most-water)

## Slow and fast pointers

Two pointers do not have to move toward each other. To remove duplicates from a sorted array in place, slow marks the last value kept and fast reads ahead. When A[fast] differs from A[slow], slow moves up one and A[fast] is copied there. When it is a duplicate, fast just moves on. fast reads each value once, so it is O(n) with no second array. The function returns k, and the answer is A[0..k − 1]; whatever is left after that is junk the caller drops. [Remove duplicates with slow and fast](#example:remove-duplicates)

The same pattern partitions an array (quicksort's Lomuto partition), removes every copy of a value, and merges two sorted arrays. Linked lists have their own version, with fast moving two steps for every step of slow, in [Floyd's cycle detection](/floyd-cycle/).

```check
Q: removeDuplicates on 2 2 2 5 5 7. What does it return?
- 6
- 2
* 3
- 4
= Three distinct values, 2, 5 and 7, end up in A[0..2], so k = 3.
```

## When to use it

Use two pointers when the input is sorted (or the argument does not need sorting, as with the water) and you are looking for a pair, or for a contiguous stretch. Sorting first costs O(n log n), which still beats O(n²). Three-sum is pair sum inside a loop: fix one value and run two pointers on the rest, O(n²) instead of O(n³).

Avoid it when you need the original positions of unsorted values: sorting loses them, unless you sort pairs of (value, index). A hash set finds a pair sum in O(n) on unsorted input, at the price of O(n) extra space. And if the question is about one fixed-size or growing stretch of the array, [sliding window](/sliding-window/) is the closer fit.

## Common mistakes

- Running pair sum on unsorted input. The code runs, can report no pair when there is one, and nothing warns you.
- Writing `while lo <= hi`. Then lo = hi pairs a value with itself.
- Moving both pointers after a miss. Only one end is proven useless; the other might still be in the answer.
- Moving the taller wall in the water problem. It looks reasonable and skips the best container.
- Forgetting that removeDuplicates only returns k. The array still has n slots, and the tail is leftovers.

## Try this

- Load 1 3 4 6 8 11 and try targets 10, 14 and 20 with **Pair sum**. Before each press, predict which pointer moves.
- Load 5 1 4 2 3 and press **Pair sum** with 9. Then **Sort A** and try again.
- Load 1 2 4 3 and press **Most water**. Is the widest container the best one?
- [Reverse in place](#example:reverse-in-place). How many swaps for 7 values? For 8?
