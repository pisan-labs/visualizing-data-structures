# Activity selection

One room, many requests. Each activity wants the room from its start time to its finish time, and two activities cannot overlap. Which ones should you accept to fit as many as possible? Not the most hours, the most activities. With n requests there are 2ⁿ subsets to check, or one simple rule that is always right.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Select | Sort by finish time, then take each activity that starts at or after the finish of the last one taken | Θ(n log n), Θ(n) if already sorted |

Take the activity that finishes first. Throw away everything that overlaps it. Repeat with what is left. Because the activities are sorted by finish time, "overlaps nothing taken" is a single comparison: does it start at or after the finish of the last one taken? [Show me](#play:eleven)

Times are half-open, [s, f): an activity can start the moment another finishes. [Back to back](#example:back-to-back), all of them fit.

## Why earliest finish is safe

Greedy algorithms are easy to write and easy to get wrong, so this one needs an argument. It is an exchange argument.

Let a be the activity that finishes first, and take any best schedule S (a largest set with no overlaps). Let b be the activity in S that finishes first. If b = a, fine. If not, swap b out of S and put a in. Does anything break? a finishes no later than b, because a finishes first of all. Every other activity in S starts at or after b's finish, so it also starts at or after a's finish. No new overlaps, and S has the same size. So some best schedule starts with a.

Now the rest of the problem is the same problem on the activities that start at or after a's finish, and the same argument applies again. Every choice greedy makes can be swapped into a best schedule, so greedy ends up with a best schedule.

```check
Q: The exchange argument swaps the first activity of a best schedule for the activity that finishes first. Why does the swap never cause an overlap?
- Because the activity that finishes first is also the shortest
* Because it finishes no later than the one it replaces, so everything after still fits
- Because it starts first
- Because the best schedule has no other activities
= Everything else in the schedule started after the replaced activity finished, so it starts after the new one finishes too.
```

## Rules that look just as good

Pick the **shortest** activity first? It sounds sensible: short activities leave the most room. But a short activity can sit across two longer ones that fit together. With 1-5, 4-7 and 6-10, shortest first takes 4-7 and nothing else fits. Earliest finish takes 1-5 and 6-10. [Show me](#play:shortest-fails)

Pick the **earliest start** first? One long activity that starts early blocks the whole day: 0-10 against 1-3, 4-6 and 7-9. [Show me](#play:start-fails)

Switch rules under Options and run them. Note that a bad rule can still get the right answer on a given input; [shortest first on the eleven](#example:eleven-shortest) finds four, the same as earliest finish. One counterexample is enough to sink a rule. A lucky example proves nothing.

```check
Q: Activities 1-5, 4-7 and 6-10. How many does shortest first take, and how many fit at most?
- 2 and 2
* 1 and 2
- 1 and 1
- 3 and 3
= Shortest first takes 4-7, which overlaps both others: 1. Earliest finish takes 1-5 and 6-10: 2.
```

## When to use it

Booking a room, a machine, a court or a lecture hall when every booking is worth the same. If bookings have different values (weighted activity selection), greedy fails and you need dynamic programming: sort by finish time and, for each activity, take the better of skipping it or taking it plus the best schedule that ends before it starts. If you have to fit every activity and want the fewest rooms, that is interval partitioning, a different greedy.

## Common mistakes

- Sorting by start time, or by length. Only finish time is safe here.
- Using s > f instead of s ≥ f, so back-to-back activities clash.
- Forgetting to sort. The single comparison with the last activity only works in finish order.
- Trusting a rule because it worked on an example. Look for a counterexample first.

## Try this

- [Everything overlaps](#example:all-overlap): which one does it keep, and why that one?
- Type `1-3 2-4 3-5 4-6 5-7`, press **Load activities**, and run all three rules.
- Find activities where earliest start first gets 1 and earliest finish first gets 4.
