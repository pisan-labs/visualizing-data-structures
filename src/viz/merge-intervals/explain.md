# Merge intervals

A calendar full of meetings, typed in whatever order people booked them. When is somebody busy? Overlapping meetings should become one block. The obvious way checks every meeting against every block found so far. The pattern sorts by start first, and then one pass does it: each meeting either reaches the last block, or starts a new one.

An interval here is a start and an end, such as 2–5. By default the ends count, so 1–3 and 3–5 touch and merge into 1–5.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| merge, sort then one pass | sort by start, then merge each into the last one out or start a new one | Θ(n log n) |
| merge, check every interval out | take them as they come, check each against all the intervals out so far | Θ(n²) worst |
| insert into a sorted list | copy what ends before, absorb what overlaps, copy the rest | Θ(n) |
| intersect two sorted lists | one index in each, move past the one that ends first | Θ(m + n) |

Why is one check per interval enough? Once the list is sorted by start, every interval out before the last one ended before the last one started (or they would have merged). The next interval starts no earlier than the last one did. So it can only reach the last one out, never anything before it. [Show me](#play:sort-then-merge)

The **Approach** option switches to the naive way. Both give the same list. The variables count the work: `comparisons` is the sort's comparisons of two starts (a merge sort), `checks` is one interval tested against another, and `naive total` and `pattern total` say what each approach costs on this input.

## How it works

1. Sort the intervals by start.
2. The first one starts the output.
3. For each of the others: if it starts before the last one out ends (or just as it ends), merge it, keeping the later end. Otherwise it starts a new one.

[Sort, then one pass](#example:sort-then-merge) has 4–7, 1–3, 9–12, 2–5, 10–11, 13–15 and 15–17. Sorted: 1–3, 2–5, 4–7, 9–12, 10–11, 13–15, 15–17. The merge sort takes 11 comparisons. Then 2–5 reaches 1–3 and the end grows to 5. 4–7 grows it to 7. 9–12 starts after 7, so it starts a new one. 10–11 lies inside 9–12: nothing changes. 13–15 starts a new one, and 15–17 touches it, so the end grows to 17. Out come 1–7, 9–12 and 13–17, after 6 checks.

There are three things the next interval can do: grow the end, sit inside, or start a new one. Inside is the one people forget. [One interval covers the rest](#example:inside-one) is 2–14 with four short ones inside it; take the max of the two ends, never the new end, or 3–5 would shrink 2–14 to 2–5.

```check
Q: Sorted by start, out holds 1–3 and 6–11, and the next interval is 7–9. What happens?
- 7–9 starts a new interval
- The last one out becomes 6–9
* Nothing changes: 7–9 is inside 6–11
- 7–9 merges with 1–3
= 7 is before 11, so they overlap, and 9 is before 11, so the end stays 11. Keep the larger end.
```

## Touching ends

Do 13–15 and 15–17 overlap? It depends on what an interval means. With times as [start, end], both include 15, and most interview problems merge them. With half-open times [start, end), as on [interval partitioning](/interval-partitioning/) and [activity selection](/activity-selection/), a meeting that ends at 15 is gone when the next starts at 15, and they share no moment. [Touching ends stay apart](#example:touching-stays-apart) runs the same list with that setting: 13–15 and 15–17 stay apart, and 4 intervals come out instead of 3.

The only change in the code is `<=` against `<`. Getting it wrong is the most common bug on this problem, so check what the problem says about touching.

## Check every interval out

The naive way skips the sort. Take the intervals as they come. Check each one, x, against every interval out so far: absorb each one it overlaps (x grows to cover both), and keep the rest. Then put x out where its start belongs. [Check every interval out](#example:every-interval-out) does the same list with 13 checks.

13 is fewer than 17. Is the pattern always cheaper? Nope. When the intervals merge a lot, the list out stays short and each new interval meets only a few. [Each overlaps the next](#example:one-chain) merges six into one with 5 checks; the pattern spends 7 comparisons just sorting. The naive way hurts when nothing merges. [Nothing overlaps](#example:nothing-overlaps) has 8 intervals and the list out grows by one each time: 0 + 1 + … + 7 = 28 checks, against 17 comparisons and 7 checks. At 1,000 intervals that is 499,500 checks, against fewer than 9,000 comparisons for a merge sort and 999 checks. Big-O is about the big cases.

## Insert one interval

Now the list is already sorted and nothing in it overlaps, and one new interval x arrives. No sort needed. Walk the list once:

1. copy the intervals that end before x starts;
2. absorb the ones that start before x ends (x grows);
3. put x out, then copy the rest as they are.

[Insert in one pass](#example:insert-one-pass) inserts 5–12 into 1–2, 4–6, 8–10, 12–13, 15–17. 1–2 is copied. 4–6, 8–10 and 12–13 are absorbed (12–13 only touches, which counts here), so x becomes 4–13. 15–17 starts after it. The list becomes 1–2, 4–13, 15–17 after 6 checks. [Insert by merging again](#example:insert-append-again) appends 5–12 and merges all six again: 9 comparisons and 5 checks, and the sort learns nothing from the list being sorted already.

The pass is Θ(n) even when two checks place x, because building the new list copies every interval. Binary search finds where x goes in O(log n), but the copy is still n.

## Intersect two lists

Two sorted lists, A and B, nothing overlapping within a list. What do they have in common? Keep one index in each. The overlap of A[i] and B[j], if any, runs from the later start to the earlier end. Then move past whichever ends first: it cannot meet anything further along the other list, since everything there starts later.

[Intersect with two indices](#example:intersect-two-indices) has A = 1–4, 6–9, 11–15 and B = 2–7, 8–12, 14–16. Five checks find 2–4, 6–7, 8–9, 11–12 and 14–15. [Intersect every pair](#example:intersect-every-pair) checks all 3 × 3 = 9 pairs and finds the same five. This is the [two pointers](/two-pointers/) pattern on intervals, and the same walk as the merge step of [merge sort](/merge-sort/).

```check
Q: The two indices are at A[i] = 3–10 and B[j] = 5–7. They overlap from 5 to 7. Which index moves?
- i, since A[i] started first
* j, since B[j] ends first
- Both
- Neither: check A[i] against the rest of B first
= B[j] ends at 7. Everything later in A starts after 10, so B[j] can meet nothing more. A[i] still might, so it stays.
```

## Spot it

Reach for this pattern when the problem says:

- **intervals, ranges, bookings, meetings** given as start and end;
- **overlapping** ones should **combine**, or you want the **total covered**, or the **free gaps** between them;
- a **new** one goes into a **sorted list with no overlaps** (insert in one pass);
- **two** sorted lists, and you want what they have **in common** (two indices).

Three problems of our own:

- A log of when each machine in a lab was switched on and off. Report the stretches when at least one was on. (Merge.)
- A ruler with marked segments, some overlapping. How much of the ruler is marked? (Merge, then add up the lengths.)
- Two runners each logged the stretches of a trail they ran, as sorted lists. Which stretches did both run? (Intersect.)

Look-alikes that call for something else: "how many are on at the same moment" asks for a count, not the covered time, which is a [sweep line](/sweep-line/). "Pick as many as possible that do not overlap" is [activity selection](/activity-selection/): you drop intervals instead of merging them. "How many rooms" is [interval partitioning](/interval-partitioning/).

## When to use it

Use it when the answer is the covered time itself: busy blocks, the union of ranges, the gaps between them (the gaps are just the spaces between consecutive intervals out). It works for any number type, since it only compares ends.

Avoid it when intervals keep arriving and you must answer after each one: re-merging every time is O(n log n) per update, and an [interval tree](/interval-tree/) or a balanced tree of the merged blocks does better. And for counting overlaps rather than covering, merging throws away exactly what you need.

## Common mistakes

- Forgetting to sort first. The one-check pass is only right in start order.
- Setting the end to the new interval's end instead of the larger of the two. An interval inside the last one out would shrink it.
- Using `<` where the problem means `<=`, or the other way round. Decide what touching means first.
- In the intersection, moving the index that started first instead of the one that ended first.

## Try this

- [Sort, then one pass](#example:sort-then-merge): before you run it, say what each interval does: grow, inside or start.
- Switch **Intervals that only touch** to stay apart and run it again. Which one changes?
- [Nothing overlaps](#example:nothing-overlaps) and [Each overlaps the next](#example:one-chain): run each both ways and watch `naive total` and `pattern total`. Which approach wins each?
- Merge any list, then type 5-9 and press Insert. Which intervals does it absorb?
- Press Compare, set one side to check every interval out, and fill both with "Nothing overlaps" at 8. Watch `checks`.
