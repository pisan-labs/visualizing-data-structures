# Binary search on the answer

Some problems ask for the smallest value that works, or the largest. The smallest truck that ships everything in three days. The widest spacing for three items on a line. There is no sorted array in sight, so binary search does not look like it applies. It does. The array is the list of possible answers, and "does this one work?" is the comparison.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| smallest capacity, binary search | halve the range of capacities with each check | O(n log S) |
| smallest capacity, every capacity upward | check max(w), max(w) + 1, … until one fits | O(n · S) |
| largest gap, binary search | halve the range of gaps with each check | O(n log n + n log D) |
| one check | a greedy pass over the values | O(n) |

The trick needs one property: the answer to "does x work?" flips only once. Small capacities fail, then from some point on every capacity fits. That point is the answer, and binary search finds it the way [lower bound](/binary-search/) finds the first value ≥ x in a sorted array. Same template, different array. [Show me](#play:ship-in-three-days)

The **Approach** option switches to the naive way: try every answer, from the bottom up. Both give the same answer. The variables count the work: `checks` is how many times the check runs, `reads` how many values those checks look at, and `naive total` and `pattern total` say what each approach costs on this input.

## How it works

Packages leave in order, one truck a day, and no truck may carry more than the capacity c. In [Ship in three days](#example:ship-in-three-days) the weights are 4 7 2 6 3 5 1 8 and d = 3.

First, the range. The answer is at least 8, since the heaviest package has to fit on some truck. It is at most 36, the total: one day takes everything. So lo = 8 and hi = 36. Then:

1. mid = (8 + 36) / 2 = 22. It fits in 2 days. So does every bigger capacity, so hi = 22.
2. mid = 15 fits (3 days): hi = 15.
3. mid = 11 needs a fourth day: too small, and so is everything below it. lo = 12.
4. mid = 13 fails too: lo = 14.
5. mid = 14 fits: hi = 14.

lo = hi = 14. Five checks for 29 possible capacities. The trucks carry 4 7 2, then 6 3 5, then 1 8.

Each check is what you would do by hand: fill today's truck until the next package would go over c, then start a new day, and give up once there are more days than d. Giving up early saves reads: with d = 1, the check of 22 stops at the sixth package.

```check
Q: Capacity 17 ships the packages in 3 days. What do you know about capacity 18?
* It ships them in 3 days or fewer
- It needs more than 3 days
- Nothing: you have to check it
- It ships them in exactly 3 days
= A bigger truck never needs more days: the same loading still fits. That one-way flip is what makes binary search work here.
```

## Why the greedy check is enough

The check never tries clever loadings. It just packs each day as full as it can. Is that safe? Yes: packing today fuller never leaves more for later, so if any loading fits in d days, the greedy one does. It is the same kind of argument that makes greedy [activity selection](/activity-selection/) right. A check that is wrong in one direction breaks the whole search, so it is worth convincing yourself.

## The largest instead

Now k items go on some of the positions 1 3 8 12 13 19 24, and the smallest gap between neighbours should be as large as possible. Flip the logic: a gap g that works keeps working when g shrinks. The check puts an item on the first position, then each next one on the first position at least g past the last.

In [Spread three items](#example:spread-three-items) with k = 3, the gaps run from 1 to 23. mid = 12 fails (only 2 items fit), then 6, 9, 10 and 11 all fit. The items go on 1, 12 and 24, gaps 11 and 12. Answer 11.

Look at mid there: (lo + hi + 1) / 2, rounded down, so it rounds up. With lo = 10 and hi = 11, rounding down gives mid = 10, it fits, lo = 10 again, and the loop never ends. Rounding up gives 11. Searching for the largest, the update is lo = mid, so mid must never equal lo.

```check
Q: A search for the largest answer has lo = 5 and hi = 6. It uses mid = (lo + hi) / 2, rounded down, and lo = mid when the check passes. What happens if 5 passes?
- It returns 5
- It returns 6
* It loops forever with lo = 5
- It checks 6 next
= mid is 5, the check passes, lo stays 5 and hi stays 6. Nothing changes. Round mid up, (lo + hi + 1) / 2, when the passing case sets lo = mid.
```

## Every answer upward

The naive way checks max(w), then max(w) + 1, and so on until one fits. [Every capacity upward](#example:every-capacity-upward) takes 7 checks and 49 reads to find the same 14. Binary search took 5 and 40. Close, because 14 is near the bottom of the range.

Move the answer to the top and the gap opens. [One day for everything](#example:one-truck-for-everything) has d = 1, so the answer is the total, 36. Trying upward checks all 29 capacities, 160 reads. Binary search needs 4 checks and 30 reads.

Is binary search always cheaper? Nope. In [A day for each package](#example:a-day-per-package), d = 8, so the heaviest package, 8, is the answer. Trying upward gets it on the first check, 8 reads. Binary search still halves its way down through 22, 15, 11, 9 and 8: 5 checks, 40 reads. It never looks at where the answer is likely to be. The largest gap has the same pair: [Two items take the ends](#example:two-items-take-the-ends) (22 checks upward, 5 binary) and [Every position taken](#example:every-position-taken) (1 upward, 4 binary).

## Spot it

Reach for this pattern when the problem says:

- **the smallest x such that…** or **the largest x such that…**, where x is a number you could just try;
- **within d days, at most k groups, at least m pieces**: a limit that is easy to check for one x;
- **more of x only helps** (a bigger truck, a faster speed, a shorter piece): the yes/no answer flips once;
- **minimize the maximum** or **maximize the minimum**: almost always this pattern.

Three problems of our own:

- A printer must print n chapters in order within d days. What is the fewest pages a day that is enough? (The ship problem in disguise.)
- Cut n boards into pieces of one length L, rounding each board's count down. What is the longest L that gives at least m pieces? (Largest; the check adds up the pieces.)
- n machines each make a part every t minutes, each its own t. What is the least time to make m parts together? (Smallest time; the check adds T / t over the machines.)

Look-alikes: "find the first value ≥ x in a sorted list" is plain [binary search](/binary-search/), with no check to write. "The longest stretch within a budget, all values positive" is usually a [sliding window](/sliding-window/), one pass instead of log n of them.

## When to use it

Use it when checking one answer is easy and finding the best one directly is not. The cost is the check times log₂ of the range, so a range of a billion answers still takes about 30 checks.

Avoid it when the check does not flip once. If capacity 15 fits but 16 does not, binary search will happily return nonsense. And when the range is tiny, or the answer is likely near the bottom, trying upward is simpler and can be faster.

## Common mistakes

- A check that is not monotone. Test it on a few values in a row before trusting the search.
- The wrong range. Start hi below the answer and it can never be found. Start the capacity at 1 instead of max(w) and this check goes wrong: a package heavier than c still goes on a truck of its own, and nothing notices.
- Rounding mid down when the passing case sets lo = mid. The loop gets stuck one step from the end.
- Returning mid instead of lo. The last mid checked is not always the answer: in the largest-gap search the last one can fail.
- Overflow in lo + hi with big ranges in Java or C++. lo + (hi − lo) / 2 avoids it.

## Try this

- [Ship in three days](#example:ship-in-three-days): before each check, say the next mid.
- Load `5 5 5 5 5 5` and search with d = 2. Guess the answer first.
- [A day for each package](#example:a-day-per-package): switch Approach to every answer upward. Which wins, and why?
- Press Compare, pick this page with other options, set one side to every answer upward, and load 10 heavy packages. Search with d = 1 and watch `checks` on both sides.
- Switch Problem to the largest gap, load `0 10 20 30 40 50`, and search with k = 4. Guess first: is it 50 / 3, about 16?
