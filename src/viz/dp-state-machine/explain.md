# States over time

One item, one price per day. Each day you may buy it, sell it or rest, you hold at most one at a time, and you start with nothing. When should you trade? With no rules the answer is easy: take every rise. Add one rule, a rest day after every sale, and every choice now ties up the next day too. Greedy stops working. A small state machine fixes it: keep the best money you can have in each state at the end of each day.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| solve, the table | one cell per state per day, each from the day before | Θ(n) |
| solve, plain recursion | the same rules, nothing stored | 2ⁿ⁺¹ − 1 calls without the cooldown |
| trace the plan | walk back from the answer, noting buys and sells | Θ(n) |

The states, with the cooldown on:

- **free**: holding nothing, free to buy;
- **hold**: holding the item;
- **cool**: sold today, so tomorrow is a rest.

Each state today comes from a state yesterday, along a move of the machine. With p today's price and f the fee:

- free[t] = max(free[t − 1], cool[t − 1]): rest, or rest the day after a sale;
- hold[t] = max(hold[t − 1], free[t − 1] − p): keep it, or buy today;
- cool[t] = hold[t − 1] + p − f: sell today.

Before day 1 you are free with 0, and the other states are impossible, −∞. The answer is the better of free[n] and cool[n]. [Show me](#play:cooldown-sell-early)

The diagram is a small state machine, like the automata on [DFA](/dfa/), except each move carries money and the table keeps the best total for each state. Turn the **Cooldown** off and cool disappears: a sale moves you straight back to free. **Fee per sale** takes f off every sale.

The **Approach** option switches to plain recursion on the same rules. `calls` counts calls of the recursive function, `cells` counts table cells filled, and `naive total` and `pattern total` say what each approach costs on these prices.

## How it works

One column per day, one row per state. Every cell reads at most two cells of the column before it, so fill the columns left to right.

[With a cooldown, sell early](#example:cooldown-sell-early) has prices 6 1 4 9 1 7. The obvious plan buys at 1 on day 2 and holds to the 9 on day 4: 8. But then day 5 is the rest day, and day 5 is when the price drops to 1 again. The table finds something better. cool[3] = hold[2] + 4 = −1 + 4 = 3: sell early, on day 3. That 3 rests on day 4 (free[4] = 3), buys at 1 on day 5 (hold[5] = 3 − 1 = 2) and sells at 7 on day 6: cool[6] = 9. The trace reads it back: buy on day 2, sell on day 3, buy on day 5, sell on day 6.

Turn the cooldown off and you get [No rules: take every rise](#example:free-trading): 14, the sum of the rises 3 + 5 + 6. Nothing is wasted, so the best plan never misses a rise.

```check
Q: With the cooldown on, today's price is 5. Yesterday hold = −2, free = 4 and cool = 6. What is free today?
- 4
* 6
- 3
- 9
= free today is max(free yesterday, cool yesterday) = max(4, 6) = 6. Selling today (−2 + 5 = 3) leads to cool, not free.
```

## Plain recursion

The rules are already recursive functions: hold(t) asks for hold(t − 1) and free(t − 1), and so on, down to day 0. Nothing is stored, so an early state is worked out again for every chain of moves from it to the end.

[Plain recursion asks again and again](#example:recursion-repeats) makes 112 calls for 21 cells on six days; free(0) alone is called 21 times. Without the cooldown, free and hold each ask for both states of the day before, so the calls double every day: 2ⁿ⁺¹ − 1, which is 127 for six days and 511 for eight. The table fills 3 cells a day, 2 without the cooldown.

## A fee merges trades

A fee makes small trades lose money. [A fee merges small trades](#example:fee-merges-trades) has prices 1 5 4 8 3 6 and a fee of 2. With no fee, three trades make 4 + 4 + 3 = 11. With the fee, selling at 5 and buying back at 4 gains 1 and pays 2, so the best plan holds from 1 all the way to 8, then trades once more from 3 to 6: (8 − 1 − 2) + (6 − 3 − 2) = 6.

The rules stack. Cooldown and fee together are the same table with both changes; nothing new is needed.

```check
Q: Why does the cooldown need a third state?
- To remember the price you paid
* After a sale you may not buy tomorrow, so "holding nothing" splits into "free to buy" and "just sold"
- Because selling costs a fee
- It does not; two states are enough
= A state has to know everything about the past that still matters. With the cooldown, whether you sold today matters for tomorrow.
```

## When to use it

Use it when each step puts you in one of a few situations and the rules depend only on which one. Draw the states, draw the moves, write one recurrence per state. It is the same move as [the knapsack table](/dp-knapsack/): each cell is a max over a couple of choices made from the step before.

The table needs only yesterday's column, so the profit takes O(1) space: three numbers carried day to day. Keep the whole table if you want the plan back.

It needs only a few states. If a rule looks far back (no more than five trades in a month, say), the state has to carry that count, and every extra thing remembered multiplies the rows.

## Spot it

Reach for this pattern when the problem says:

- **each day (or step) you are in one of a few situations**: holding or not, working or resting, charging or flying;
- **after X you must wait**, **never three in a row**, **at most one at a time**: a rule that only looks back a step or two;
- **the most** or **the least** over the whole sequence.

Three problems of our own:

- A collector follows the daily price of one rare coin. She may own one coin at a time, and after each sale she sits out a day. What is the most she can make? (This page, with the cooldown.)
- Each hour a delivery drone is flying, charging or idle, and each hour in a mode scores points. After charging it must idle an hour. Best score over a day? (Three states, one missing move.)
- A painter is offered a day's pay for each day of the month but never works three days in a row. Most she can earn? (States: worked 0, 1 or 2 days in a row.)

Look-alikes that call for something else: "buy once and sell once" needs no table, just the lowest price so far, or [Kadane's algorithm](/kadane/) on the daily changes. "For each day, the next day with a higher price" is the next larger value: a [monotonic stack](/monotonic-stack/).

## Common mistakes

- Starting hold at 0. Then you can sell an item you never bought. It starts at −∞.
- Forgetting the cool state and letting the day after a sale be a buy.
- Reading the answer from hold[n]. Ending while holding means you paid for something you never sold.
- Charging the fee on both the buy and the sale. Pick one; this page charges the sale.
- Selling at every peak. With the cooldown, [holding to the 9 makes 8](#example:cooldown-sell-early) and selling early makes 9.

## Try this

- [With a cooldown, sell early](#example:cooldown-sell-early): before you play it, find the best plan by hand.
- Turn the cooldown off on the same prices. Why is the answer the sum of the rises?
- [A fee merges small trades](#example:fee-merges-trades): set the fee to 1, then to 3. When does the plan change?
- Press Compare, pick this page with other options, and set one side to plain recursion. Load eight prices and watch `calls`.
- [Rising prices: one trade](#example:rising-prices) and [Falling prices: never trade](#example:falling-prices): which states stay at −∞ the longest?
