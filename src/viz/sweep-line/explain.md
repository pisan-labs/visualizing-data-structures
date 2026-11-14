# Sweep line

A call log for one day: when each call started and ended. What is the largest number of calls going on at the same moment? You could stop at every moment that matters and count. The sweep line does it in one walk: turn each call into two events, a start and an end, sort the events by time, and slide a line across them, keeping only what is open right now.

The same walk draws a skyline: buildings on one line, and the outline you see from far away. There the line carries a max-heap of the heights standing.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| the most open, sorted events | start +1, end −1, keep the highest count | Θ(n log n) |
| the most open, every start | count the intervals open at each start | Θ(n²) |
| skyline, max-heap | push at a left edge, pop what has ended, read the top | O(n log n) |
| skyline, every building at every edge | the tallest standing at each edge | Θ(n²) |

Everything interesting happens at an event. Between two events nothing starts and nothing ends, so the count (or the tallest height) cannot change. Sort the 2n events once, and each one costs O(1) for the count, or O(log n) for the heap. [Show me](#play:sweep-events)

The **Approach** option switches to the naive way. Both give the same answer. The variables count the work: `comparisons` is two keys compared, sorting the events (a merge sort) or inside the heap; `updates` is one change to what is open (the count goes up or down, a push or a pop); `checks` is one interval tested at one point. `naive total` and `pattern total` say what each approach costs on this input.

## The most open at once

1. Each interval gives a start event (+1) and an end event (−1).
2. Sort the events by time. At equal times, decide which goes first (next section).
3. Walk them, adding each one's +1 or −1 to `open`, and keep the highest value.

[Sweep the sorted events](#example:sweep-events) has 1–6, 2–5, 4–9, 7–11, 9–13 and 12–14. The 12 events, sorted, are 1+ 2+ 4+ 5− 6− 7+ 9− 9+ 11− 12+ 13− 14− ("4+" is a start at 4, "5−" an end at 5). The count climbs 1, 2, 3 at times 1, 2 and 4, and never gets past 3 again. At time 4 the open ones are 1–6, 2–5 and 4–9.

```check
Q: The events, sorted, are 1+ 2+ 3− 4+ 5+ 6− 7− 8−. What is the most open at once?
- 2
* 3
- 4
- 5
= The count goes 1, 2, 1, 2, 3, 2, 1, 0. The highest is 3, after the start at 5.
```

The naive way checks every point that could be the answer. The most overlap always begins at some interval's start (go left from the busiest moment until something would stop being open: that is a start). So for each start, count the intervals open there. [Check every start](#example:every-start) does 6 × 6 = 36 checks.

The sweep took 37: 25 comparisons to sort 12 events, then 12 updates. So the sort costs more than it saves here? Yes, at six intervals. Around seven they break even, and from eight on the sweep is ahead. At 100 intervals the starts are 10,000 checks, and a merge sort of 200 events is at most 1,345 comparisons, plus 200 updates.

## Ends first, or starts first?

Do 1–3 and 3–5 overlap? If times are [start, end), as on [interval partitioning](/interval-partitioning/), a call that ends at 3 is over when the next starts at 3. Then at equal times the ends go first. That is the default here. If times are [start, end], touching ends count, and the starts go first.

The setting only changes the order of events at equal times, and that order is the whole difference. [Touching ends: ends first](#example:touch-ends-first) has 1–3, 3–5, 3–6 and 5–8: the most is 2. [Touching ends: starts first](#example:touch-starts-first) is the same list, and the most is 3, at time 3, because 1–3 is still counted when 3–5 and 3–6 come in.

Sorting pairs (time, +1 or −1) by both parts puts −1 first at equal times, which is ends first. Handy, as long as that is the rule you want.

```check
Q: Meetings 9–10, 10–11 and 10–12, with times [start, end). At most how many are on at once?
- 1
* 2
- 3
= At 10 the end of 9–10 goes first, then 10–11 and 10–12 start: 2 on at once. With starts first it would be 3.
```

## The skyline

Now each interval is a building with a height: 2–5:7 stands from 2 to 5, 7 tall. The outline changes only at an edge, so sweep the edges left to right with a max-heap of the heights standing (a [binary heap](/binary-heap/), tallest on top):

1. at a left edge, push the building's height, with where it ends;
2. at a right edge, do nothing yet;
3. once every edge at this x is in, pop the top while it has ended;
4. the top is the tallest standing (0 if the heap is empty). If it changed, the outline has a key point (x, height).

Why do nothing at a right edge? Removing a height from the middle of a heap needs a search for it, O(n). Leaving it there costs nothing until it reaches the top, and then it is one pop. This is lazy removal. [A skyline with a max-heap](#example:skyline-heap) has 1–6:4, 2–5:7, 4–9:5, 7–11:3 and 9–13:6. At x = 9, 4–9 ends while it is on top, but 9–13 pushes a 6 above it, so the 5 stays buried. At x = 13 the 6 ends and the top is popped four times: 6, then the stale 5, 4 and 3. The key points are (1, 4) (2, 7) (5, 5) (9, 6) (13, 0).

[Hidden behind a taller one](#example:skyline-hidden) is the extreme: a building 8 tall from 2 to 12 hides two short ones. Their ends pass and nothing happens; at 12 all three leave in a row. Each height is pushed once and popped at most once, so lazy removal never costs more than n pops in all.

The key point is about the height, not the events. [One roof from two buildings](#example:skyline-same-height) has 1–4:5 and 4–8:5 side by side. At 4 one ends and one starts, both height 5, and the outline does not change, so there is no key point at 4. Emit a point for every edge and you get (4, 5), which is not a corner of anything.

[A skyline, every building at every edge](#example:skyline-every-edge) is the naive way: at each of the 9 edges, check all 5 buildings for the tallest one standing. 45 checks after the same sort, 63 steps against 37.

## Spot it

Reach for a sweep line when the problem says:

- **at the same time**, **at once**, **simultaneously**, **concurrent**: how many overlap at the busiest moment;
- **how many rooms, channels, servers** so that none of them double-books: the same count;
- **outline**, **skyline**, **visible**, or **the tallest at each point** for rectangles on a line: the heap version;
- start and end **events** that each change a running total.

Three problems of our own:

- A parking garage logs each car's arrival and departure. How many spaces did the busiest moment need? (The most open.)
- Two meeting rooms' bookings, merged into one list. Was there ever a time when three bookings overlapped? (The most open, ≥ 3.)
- Banners hang along a wall, each from one point to another at some depth. What does the bottom edge of the banners look like from below? (A skyline, with depth as height.)

Look-alikes that call for something else: "report the busy blocks" wants the covered time, not a count, which is [merge intervals](/merge-intervals/). "Give each lecture a room" wants the assignment itself, which is [interval partitioning](/interval-partitioning/) with a min-heap of rooms; the sweep only counts them. And when the times are small whole numbers, a plain array of counts with +1 and −1 at the ends, then one running sum, skips the sort: that is a [difference array](/difference-array/).

## When to use it

Use it when the answer depends only on what is open at each moment: the most overlap, the total time with at least k open, the outline of rectangles. Any number type works, since the sweep only compares times.

Avoid it when the intervals keep changing and you must answer after each change: re-sorting every time is O(n log n) per update, and a segment tree or an interval tree does better. And for one query ("is anything open at time 7?") on intervals that never change, one pass of checks is O(n), no sort needed.

## Common mistakes

- Getting the tie rule backwards. Decide whether touching intervals overlap before you sort.
- Emitting a skyline point at every edge instead of only where the tallest height changes.
- Forgetting the pops: the top of the heap can be a building that ended long ago.
- Forgetting the final drop to 0 at the last right edge.
- Removing heights from the middle of a heap by searching for them. It works, but it is O(n) each, and the sweep becomes O(n²).

## Try this

- [Sweep the sorted events](#example:sweep-events): before you run it, read the sorted events and say where the count peaks.
- Switch the tie rule and run [Touching ends: ends first](#example:touch-ends-first) again.
- [Hidden behind a taller one](#example:skyline-hidden): watch the heap at x = 6 and x = 10. Why does nothing leave?
- Load `1-4:3 2-6:5 3-8:7 4-10:9` and find the skyline. How many key points before it comes down?
- Press Compare and set one side to check every point. Fill both with "All at once" at 8, and watch `checks` against `comparisons`.
