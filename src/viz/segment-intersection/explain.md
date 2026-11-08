# Segment intersection (sweep line)

You have n line segments. Do any two of them cross? Which ones? Map overlays ask this (where does this road cross that river?), so do circuit layout checks and any game that wants to know whether two walls touch.

Testing every pair is n(n − 1)/2 tests. That's fine for 8 segments and hopeless for a million. The sweep line idea, from Shamos and Hoey (1976) and then Bentley and Ottmann (1979), is to slide a vertical line from left to right and only ever test segments that are next to each other on that line.

| Question | Cost |
|---|---|
| any two intersect? (CLRS) | O(n lg n) |
| report all k intersections (Bentley–Ottmann) | O((n + k) lg n) |
| brute force | Θ(n²) |

## The two structures

The **event queue** holds the x positions where something happens: a segment starts, a segment ends, or (in Bentley–Ottmann) two segments cross. The sweep line jumps from event to event; nothing changes in between.

The **status** holds the segments the sweep line crosses right now, ordered by height, bottom to top. In a real implementation it is a balanced search tree, so insert, delete and "who is just above me?" each cost O(lg n). On this page it is the row of boxes on the right.

## Why neighbours are enough

Here is the key fact. If two segments cross at a point p, then just before p, nothing sits between them on the sweep line. So at some event before p they became neighbours in the status: when one of them was inserted, or when a segment between them ended (or crossed out of the way). Test every pair at the moment it becomes adjacent, and no crossing slips through.

That's why the algorithm only tests:

- a new segment against the segments just above and below it;
- when a segment ends, the two neighbours it was keeping apart.

```check
Q: The status is A, C, B (bottom to top) and C ends. Which pair is tested?
- A and C
* A and B
- C and B
= With C gone, A and B are neighbours for the first time. They are the only new pair.
```

## Any intersection (CLRS)

This is the version in CLRS, ANY-SEGMENTS-INTERSECT, and the default here. The events are just the 2n end points, sorted by x (left ends before right ends at the same x, then by y). Insert at a left end, test the neighbours; at a right end, test the two neighbours, then delete. The first time a test says yes, stop. [Show me](#play:crossing-found)

It does not find all crossings, and it doesn't need to. Before the sweep reaches the leftmost crossing, the status order is correct, and that crossing's two segments become neighbours before it. So if there is any intersection, the answer is yes. [Neighbours only](#example:neighbours-only)

When nothing intersects, the sweep has to go all the way to the right before it can say no. [No crossings](#example:no-crossings)

## Every intersection (Bentley–Ottmann)

Switch **Question** to report every intersection. Now a test that finds a crossing to the right of the sweep line puts that crossing into the event queue. When the sweep gets there, it reports the point and swaps the two segments in the status, since past the crossing their order flips. The swap creates new neighbours, which get tested, which may queue more crossings. [Show me](#play:report-every-crossing)

Each event costs O(lg n), and there are 2n + k of them, so O((n + k) lg n). That's output-sensitive. If almost every pair crosses, k is about n²/2, and brute force is faster. Nothing fancy, just honest.

```check
Q: Bentley–Ottmann has 10 segments and finds 3 crossings. How many events does it handle (with no shared points)?
- 10
- 13
* 23
- 45
= 20 end points plus 3 crossings.
```

## Degenerate cases

Textbooks assume general position: no vertical segments, no three segments through one point, no shared end points. Real data ignores all three.

- **Vertical segments.** At one x, a vertical segment has no single height. This page refuses them (move one end over by 1). Real code treats them as a special event or tilts the sweep slightly.
- **Three or more through one point.** The event at that point reports them all and reverses their order. [Three at one point](#example:three-at-one-point)
- **Shared end points.** Touching counts as meeting. Segments starting at the same point go into the status ordered by slope. [Shared end point](#example:shared-end-point)
- **Collinear overlaps.** Two segments along one line share infinitely many points. This page refuses them.

All the comparisons here use exact arithmetic: orientation tests with whole numbers, and crossing points as fractions. With floating point, two crossings that should be at the same x can come out in either order, and the status quietly goes wrong. I think more sweep-line bugs come from this than from anything else.

## Common mistakes

- Testing only at left ends and forgetting the right-end test. Two segments separated by a short one never get compared.
- Comparing segments by the y of their left end points instead of their height on the sweep line.
- In Bentley–Ottmann, adding a crossing that is already in the queue, or one to the left of the sweep, so it gets reported twice.
- Forgetting to swap the segments at a crossing, so the status order is wrong from then on.

## Try this

- Play [the first crossing](#example:crossing-found), and before each test, guess which two segments are compared.
- Load [report every crossing](#example:report-every-crossing) under both settings. Compare the tests counter, and see where the first one stops.
- Type `8` and press **Load segments** a few times, then **Sweep**. Compare the tests counter with the 28 pairs brute force would check.
