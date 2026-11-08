# Fractional knapsack

A knapsack holds weight W. Each item has a weight and a value, and this time you can cut items: half of an item weighs half as much and is worth half as much. Think gold dust and silver dust rather than a laptop and a guitar. What is the most value you can carry?

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Fill the knapsack | Sort by value per unit of weight; take whole items while they fit, then a fraction of the next | Θ(n log n) |

Every unit of weight in the knapsack should carry as much value as possible. So rank the items by value per unit of weight, vᵢ/wᵢ, best first. Take the best item whole if it fits, then the next, and so on. When the next item does not fit, take the part that does, and the knapsack is full. [Show me](#play:part-of-one)

With items 1:6, 2:10 and 3:12 (weight:value) and room for 5, the ratios are 6, 5 and 4. Take items 1 and 2 whole (weight 3, value 16), then 2 of item 3's 3 units, worth 8. Total 24. At most one item is ever cut.

```check
Q: Items 4:20 and 5:15 (weight:value), capacity 6. What is the most value when items can be cut?
- 20
- 35
* 26
- 18
= Item 1 is worth 5 per unit, item 2 is worth 3. Take item 1 whole (20), then 2 units of item 2, worth 2 × 3 = 6. Total 26.
```

## Why greedy is right here

Exchange argument again. Suppose a best packing carries less of the best-ratio item than it could, and some weight of a worse item instead. Swap a little of the worse item for the same weight of the better one. The weight stays the same and the value goes up (or stays the same, if the ratios tie). So some best packing takes as much of the best-ratio item as fits, and the same argument applies to what is left. The swap only works because you can swap any amount; that is the whole point.

## Whole items: where greedy fails

Now forbid cutting. That is the 0/1 knapsack. The same greedy, skipping any item that no longer fits, takes items 1 and 2 for 16, and item 3 does not fit in the 2 units left. The best choice leaves item 1 out and takes items 2 and 3: 22. [Show me](#play:whole-fails)

The exchange breaks: you cannot swap a little of item 3 for a little of item 1. Greedy can still get lucky ([whole items, and greedy gets lucky](#example:whole-lucky)), but lucky is not right. For whole items you need the table of every item and capacity, on the [0/1 knapsack page](/dp-knapsack/). Switch **Items** under Options to try the same items both ways.

```check
Q: Items 1:6, 2:10 and 3:12, capacity 5. Which is true?
- Greedy gets the best value whether or not items can be cut
* Cutting allowed, greedy gets 24, the best; whole items only, greedy gets 16 and the best is 22
- With whole items, greedy gets 22
- Cutting does not change the best value
= Cut: 6 + 10 + 2/3 of 12 = 24. Whole: greedy takes items 1 and 2 (16), but items 2 and 3 are worth 22.
```

## When to use it

Whenever the stuff can be divided: loading bulk goods, mixing ingredients, splitting a budget across investments that scale, bandwidth across flows. It is also the bound inside branch and bound for the 0/1 knapsack: the fractional answer is never below the 0/1 answer, so it tells you when a branch cannot win. [Equal value per weight](#example:equal-ratio) is the dull case: every packing that fills the knapsack is best.

## Common mistakes

- Sorting by value, or by weight. Only value per weight works.
- Using greedy for whole items. It is a fine guess, and sometimes wrong.
- Forgetting the last, partial item. Stopping at the first item that does not fit leaves room empty.
- Computing ratios with integer division, so 5/2 and 2/1 look equal.

## Try this

- [Room for everything](#example:everything-fits): does the order matter now?
- [Six items, capacity 15](#example:six-items). Which item would be cut with capacity 14?
- Type `5:30 4:20 3:12`, press **Load items**, then type `7` and press **Capacity**. Predict the value before you fill.
