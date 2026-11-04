# 0/1 knapsack

You have a knapsack that holds a weight of W, and a pile of items, each with a weight and a value. Which items should go in to carry the most value? Each item goes in whole or not at all; that is the 0/1. Trying every subset of n items is 2ⁿ work, which for 30 items is more than a billion subsets.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Fill the table | K[i][c] for every item i and capacity c | O(nW) time and space |
| Trace back | Walks up from K[n][W] and reads off the items | O(n) |

Let K[i][c] be the best value you can get from items 1 to i with room for weight c. Item i is either out or in.

- Out: the best is whatever items 1 to i − 1 can do with the same room, K[i − 1][c].
- In, if it fits (wᵢ ≤ c): its value vᵢ, plus the best the earlier items can do with the room that is left, K[i − 1][c − wᵢ] + vᵢ.

K[i][c] is the larger of the two. Row 0 has no items, so it is 0 everywhere.

## Filling the table

Fill one row per item, from capacity 0 up. Each cell reads at most two cells in the row above: straight up (skip the item) and wᵢ columns to the left (take it, marked +vᵢ). The blue arrow wins. Each item's weight and value sit to the left of its row. [Show me](#play:four-items)

```check
Q: Item 3 weighs 2 and is worth 7. In the row above, K[2][5] = 8 and K[2][3] = 4. What is K[3][5]?
- 8
* 11
- 15
- 7
= Skipping item 3 gives K[2][5] = 8. Taking it gives K[2][3] + 7 = 11, which is better.
```

## Which items?

The bottom-right cell is the best value. To see which items make it, walk up from K[n][W], one row at a time. If K[i][c] differs from the cell above it, item i made the difference: take it and move left by its weight. If they are equal, item i is not needed. The items you take line up under the table. The walk takes exactly one step per item, so it is O(n).

## Why the best ratio first fails

A natural greedy idea: sort the items by value per unit of weight and take each one that still fits. Take three items, weight:value 1:6, 2:10 and 3:12, with room for 5. Their ratios are 6, 5 and 4. Greedy takes item 1, then item 2, and then item 3 no longer fits: value 16. The table leaves item 1 out and takes items 2 and 3, which fill the knapsack exactly: 22. [Show me](#play:greedy-fails)

Greedy fails because an item is all or nothing. If you could take part of an item, the fractional knapsack, the best ratio first is the right answer.

```check
Q: Items 1:6, 2:10 and 3:12 (weight:value), capacity 5. What does greedy by value per weight get?
- 22
* 16
- 18
- 12
= It takes item 1 (6 per unit), then item 2 (5 per unit), leaving room 2, which item 3 does not fit. 6 + 10 = 16.
```

## What it costs

The table has (n + 1)(W + 1) cells, each O(1), so filling it is O(nW). Like making change, that is pseudo-polynomial: W is a number, not a length, and a capacity with 10 digits would need billions of columns. No algorithm is known that is polynomial in the number of digits; the 0/1 knapsack is NP-hard. If you need only the best value, one row is enough, updated from the largest capacity down to the smallest.

[Six items and capacity 12](#example:largest) is the largest table here.

## When to use it

Use it to choose under a budget when the weights are small whole numbers: what to pack, which projects to fund, which files fit on a disk. Avoid it when the capacity is huge, or when the weights are not whole numbers; then the columns stop being countable, and you need another method.

## Common mistakes

- Reading K[i][c − wᵢ] instead of K[i − 1][c − wᵢ]. That lets an item go in twice, which is a different problem, the unbounded knapsack.
- Updating a single row from small capacities to large, which has the same effect.
- Forgetting to check that the item fits before reading c − wᵢ.
- Reading the items off from the top of the table. The walk starts at the bottom-right.
- Trusting the best value per weight. It is a fine guess, and sometimes it is wrong.

## Try this

- [Four items, capacity 5](#example:four-items). Fill one row at a time and predict each row.
- [The best value per weight first is wrong](#example:greedy-fails).
- [Every item is too heavy](#example:nothing-fits) and [room for everything](#example:everything-fits).
- Type `2:3 3:4 4:5 5:6`, press **Load items**, then type `7` and press **Capacity**. Which items does the table pick now?
