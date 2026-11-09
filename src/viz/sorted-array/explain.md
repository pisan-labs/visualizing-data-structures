# Sorted vs unsorted array

Same array, two habits. An unsorted array keeps items in whatever order they arrive. A sorted array keeps them in order, smallest first, and pays for that on every insert. The **Mode** option switches between the two, so you can run the same operations both ways and count the cost.

## The trade

| Operation | Unsorted | Sorted |
|---|---|---|
| `insert(x)` | O(1): put it at the end | O(n): shift the bigger items right |
| `search(x)` | O(n): check every item | O(log n): binary search |
| `delete(x)` | O(n): find it, then shift | O(n): find it fast, then shift |
| `min()`, `max()` | O(n): scan | O(1): first and last items |
| `lowerBound(x)`, `upperBound(x)` | not meaningful | O(log n) |

Sorting moves the work from search time to insert time. Which is better depends on what you do more often.

The **comparisons** and **moves** variables count the work of each operation. A move is an item shifted to make or close a gap.

## Binary search

In a sorted array, one comparison tells you a lot. Look at the middle item. If it is x, you're done. If it is smaller than x, so is everything to its left, and that whole half can go. If it is bigger, the right half goes. Each round halves the range, so a million items need about 20 rounds. [Show me](#play:binary-search)

The bookkeeping is two indices, `lo` and `hi`, that bracket where x could still be. The range shrinks until `A[mid] == x` or `lo` passes `hi`, which means x is not there. [Searching for a value that is not there](#example:missing) shows the second case.

Compare with [the same search without order](#example:linear-search): 7 comparisons instead of 3, and the gap grows with n.

```check
Q: Binary search on a sorted array of 1,000 items. About how many rounds can it take to decide that x is missing?
- 1,000
- 500
- 100
* 10
= Each round halves the range: 1000, 500, 250, ..., 1. That is about log₂ 1000, which is a little under 10 halvings.
```

## Keeping it sorted

Insert pays for the order. It starts at the end and walks left, shifting every item bigger than x one slot right, until it finds an item that is not bigger. x goes in the gap. Inserting the largest value costs nothing. Inserting the smallest shifts everything. [Inserting in order shifts the bigger items](#example:insert-shift) shows both, and [reverse order](#example:reverse-full) hits the worst case every time.

Delete is O(n) either way. Finding x is fast when sorted, but closing the gap still shifts every item after it. Have a look at [delete finds the item, then closes the gap](#example:delete).

## Lower bound and upper bound

`search` answers "where is x?". `lowerBound(x)` answers a more useful question: "where would x go?". It returns the first index whose item is at least x, and `upperBound(x)` the first index whose item is more than x. Both are binary searches that never stop early, so they always take about log₂ n rounds.

With duplicates they bracket the run. All the copies of x sit from `lowerBound(x)` up to, but not including, `upperBound(x)`, so the difference counts them. See [lower and upper bound around duplicates](#example:bounds). C++'s `std::lower_bound` and `std::upper_bound`, and Python's `bisect_left` and `bisect_right`, do the same job.

Neither makes sense in an unsorted array, so in that mode they refuse to run.

```check
Q: A sorted array holds 10, 20, 20, 20, 30. What do lowerBound(20) and upperBound(20) return?
- 1 and 3
* 1 and 4
- 0 and 4
- 2 and 3
= The first item that is at least 20 is at index 1, and the first item that is more than 20 (the 30) is at index 4. 4 - 1 = 3 copies of 20.
```

## When to use which

Keep the array sorted when you search far more often than you insert: a lookup table built once and read many times, or data that arrives in order anyway. Leave it unsorted when items keep arriving and searches are rare, like a log you only scan once in a while. If you need fast inserts and fast searches, neither array is the right tool. That is what balanced search trees and hash tables are for.

## Common mistakes

- Running binary search on an unsorted array. It doesn't crash. It just gives wrong answers, which is worse.
- Mixing up the two loop styles. `while lo ≤ hi` goes with `hi = size - 1` and `hi = mid - 1`; `while lo < hi` goes with `hi = size` and `hi = mid`. Mix them and the loop either runs forever or skips an item.
- Writing `mid = (lo + hi) / 2` with ints in Java or C++. Once an array has more than about a billion items, `lo + hi` overflows. `lo + (hi - lo) / 2` doesn't. This bug sat in Java's own library for years.
- Shifting from the front when inserting. Start from the end, or you overwrite the items you are moving.
- Expecting `search` to return the first copy of a duplicate. Binary search returns whichever copy it lands on. Use `lowerBound` for the first one.

## Try this

- [Binary search halves the range](#example:binary-search), then [the same search without order](#example:linear-search). Compare the comparisons.
- [min and max: a full scan, or one step](#example:min-max). Then switch the mode to sorted and step through again.
- Start over with the **Reverse order** preset and watch the moves pile up.
- Search for a value smaller than everything, and then one bigger than everything. Where do `lo` and `hi` end up?
