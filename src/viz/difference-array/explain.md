# Difference array

A list of updates, each "add x to every value from A[l] to A[r]". The obvious way does what it says: a loop from l to r for every update. A thousand updates, each covering most of a million values, is most of a billion additions. The difference array does each update in two writes, however long its range, and pays once at the end with one pass of running sums.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| q updates, difference array | +x at D[l], −x at D[r + 1], then one pass | Θ(q + n) |
| q updates, add to every cell | x added to each of A[l..r], update by update | Θ(q·n) worst |
| read one value between updates | A[i] plus D[0] + … + D[i] | O(n) |

Keep a second array D of n + 1 zeros. An update writes where its change starts and where it stops:

- D[l] = D[l] + x: from A[l] on, everything goes up by x;
- D[r + 1] = D[r + 1] − x: from A[r + 1] on, it stops.

After all the updates, one pass from left to right keeps run = D[0] + … + D[i]. That running sum is the total change at i, so A[i] = A[i] + run. [Show me](#play:four-updates)

Updates wait in a queue until you press Apply updates; then the **Approach** option decides how they run. The variables count the work: `writes` is cells of A or D changed by an update, `sums` is steps of the final pass, and `naive total` and `pattern total` say what each approach costs on this batch.

## How it works

[Four updates, one pass](#example:four-updates) starts with eight zeros and four updates: A[1..6] += 2, A[0..4] += 3, A[3..7] −= 1 and A[5..7] += 4. Each writes two cells of D:

- +2 at D[1], −2 at D[7];
- +3 at D[0], −3 at D[5];
- −1 at D[3], +1 at D[8];
- +4 at D[5], −4 at D[8].

Where two land on the same cell they add up: D[5] = −3 + 4 = 1. So D = 3 2 0 −1 0 1 0 −2 −3. The running sums are 3 5 5 4 4 5 5 3, and that is A. 8 writes and 8 sums, against 19 writes for adding to every cell.

Why does it work? The running sum at i adds every +x written at or before i and every −x written at or before i. An update with l ≤ i contributes its +x; if also r + 1 ≤ i, its −x cancels it. What is left is exactly the updates with l ≤ i ≤ r, the ones that cover A[i].

```check
Q: A has 6 values and D starts as 7 zeros. Write the update A[1..3] += 5 into D. What is D?
- 0 5 5 5 0 0 0
* 0 5 0 0 −5 0 0
- 0 5 0 −5 0 0 0
- 5 0 0 −5 0 0 0
= +5 at D[l] = D[1], where the change starts, and −5 at D[r + 1] = D[4], the first value it does not reach.
```

## The spare cell

D has n + 1 cells, one more than A. An update that runs to the last value writes its −x at D[n], which no value of A ever reads. It is there so the code needs no `if r + 1 < n`. [Updates to the whole array use the spare cell](#example:whole-array) has three updates that all end at A[5]: D[6] collects −2, +1 and −3, and nothing looks at it.

A starting with values is no problem either. D holds only the changes, and the pass adds them to whatever A held: in that example A = 5 3 8 1 4 2 becomes 6 4 12 5 8 6.

```check
Q: Eight updates have been written into D, which is now 2 0 −1 0 3 −4 on an array of five zeros. What is A[3] after the pass?
* 1
- 0
- 3
- 4
= A[3] is the running sum D[0] + D[1] + D[2] + D[3] = 2 + 0 − 1 + 0 = 1. How many updates there were does not matter, only what they left in D.
```

## Is it always cheaper?

Nope. The pattern costs 2q writes and n sums whatever the ranges are. Adding to every cell costs the total length of the ranges. [Short updates: the naive way wins](#example:short-ranges) has six updates of one or two values on eight zeros: 8 writes the naive way, against 12 writes and 8 sums. The pass alone costs as much as the whole naive job.

The difference array wins when the ranges are many and long. [Many long updates](#example:many-long-updates) has eight updates covering 64 cells of ten: 16 writes and 10 sums against 64 writes. With a million values and a thousand updates of half a million values each, it is about a million steps against half a billion. Each update must cover more than 2 + n/q values on average for the pattern to pay off.

[Updates that cancel leave D at zero](#example:cancel-out) is a nice picture of what D stores: A[1..4] += 3 and then A[1..4] −= 3 write into the same two cells and cancel. D shows only the net change.

## Prefix sums, backwards

The [prefix sums](/range-queries/) of range queries turn values into running totals, so a range total is one subtraction. A difference array runs the other way: its running sums are the values. D[i] is how much the change at i differs from the change at i − 1, which is where the name comes from. Take the differences of an array and then the running sums, and you get the array back; it is the same pair as a derivative and an integral.

The two tricks answer opposite questions. Prefix sums: an array that does not change, many range totals. A difference array: many range updates, then one look at the result. [Prefix sums with a hash map](/prefix-sum-hashmap/) uses the same running sums to count stretches with a given total.

When updates and reads are mixed together, neither is enough. Store D in a [Fenwick tree](/fenwick-tree/): an update adds at l and r + 1, and reading A[i] is the prefix sum of D up to i, both in O(log n).

## In two dimensions

The same idea works on a grid, for adding x to every cell of a rectangle from row r1, column c1 to row r2, column c2: +x at (r1, c1), −x at (r1, c2 + 1), −x at (r2 + 1, c1), and +x at (r2 + 1, c2 + 1), which puts back what the two −x took away twice. Then running sums along each row, and then down each column. Four writes per rectangle, one pass of the grid at the end. This page sticks to one dimension, where you can see every cell.

## Spot it

Reach for this pattern when the problem says:

- **add x to every value from l to r**, or "from day a to day b", "rows l to r": range updates;
- **many** updates: lots of them, or long ones;
- **after all of them**, "at the end", "how many at each point": you look only once, when the updates are done.

Three problems of our own:

- A road has 50 kilometre markers. Each of many road crews works from marker a to marker b. How many crews worked at each marker?
- A hotel's bookings are given as check-in night and check-out night, with the number of guests. How many guests stay each night?
- A light show turns brightness up by x on lamps l to r, again and again. What is each lamp's brightness at the end?

Look-alikes that call for something else: "after each update, what is the total of A[l..r]?" mixes updates with reads, so use a Fenwick tree or a segment tree. "The most bookings at the same time" only needs the peak, which a sweep over the sorted start and end times finds without an array as long as the timeline. "Many range totals of a list that never changes" is prefix sums, the other direction.

## When to use it

Use it for a batch of range additions on an array you read at the end, when the updates are many or long. It needs O(n) extra space for D and nothing clever.

Avoid it when you need values between updates (each read costs a pass, or use a Fenwick tree), when there are only a few short updates (just add them), and when the "array" is a timeline of billions of moments with a few events on it: then sort the events and sweep instead of allocating D.

## Common mistakes

- Writing −x at D[r] instead of D[r + 1]. The last value of the range loses its x.
- Making D only n long. An update that ends at the last value writes past the end.
- Forgetting the final pass, and reading D as if it were A.
- Writing A[i] = run when A started with values. D holds changes, so A[i] = A[i] + run.
- Using it when updates and reads alternate. Each read is O(n) and the gain is gone.

## Try this

- [Four updates, one pass](#example:four-updates): before you press play, write D yourself, then check.
- Add `0 7 1` to the start's queue and apply. Which cells of D change?
- [Short updates: the naive way wins](#example:short-ranges): set Approach to add to every cell and compare the counters.
- Press Compare, pick this page with other options, and set one side to add to every cell. Fill it with the many long updates at size 12 and watch `writes` on both sides.
- [Updates that cancel leave D at zero](#example:cancel-out): what does D look like after the first two updates?
