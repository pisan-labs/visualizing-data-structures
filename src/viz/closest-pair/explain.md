# Closest pair of points

Given n points in the plane, which two are closest? Air traffic control asks this every few seconds. So does any game that wants to know which two objects are about to collide.

The obvious answer is to try every pair: n(n − 1)/2 of them. For 16 points that is 120. For a million points it is about 500 billion. The divide-and-conquer algorithm (Shamos and Hoey, 1975) does it in O(n lg n), and the trick that makes it work is a small geometric fact: once you know a distance δ, only a handful of points can be that close to any one point.

| Method | Comparisons |
|---|---|
| brute force | n(n − 1)/2, always |
| divide and conquer | O(n lg n) |

## Divide

Sort the points by x once. Cut them in half with a vertical line x = xm, with half the points on each side. Find the closest pair on the left, recursively, and the closest pair on the right. Three points or fewer? Just compare every pair. [Show me](#play:sixteen-points)

Let δ be the smaller of the two answers. Done? Nope. The closest pair might have one point on each side of the line. [Across the line](#example:across-the-line)

## The strip

If a pair crossing the line is closer than δ, both points are less than δ from the line. So keep only the points with |x − xm| < δ: a strip 2δ wide. Sort the strip by y (or better, keep a copy of the points sorted by y from the start and split it along with the halves, so the strip comes out sorted for free).

Now walk up the strip. For each point, compare it with the points above it, and stop as soon as one is δ or more higher. Here is the fact: at most 7 points get compared. Draw a δ × 2δ box above p, straddling the line. Each δ × δ half belongs to one side, and points on one side are at least δ apart, so each half holds at most 4 of them, one in each corner. 8 points in the box, p among them, leaves 7.

So the strip costs O(n) per level, and the recurrence is T(n) = 2T(n/2) + O(n) = O(n lg n). Same recurrence as merge sort.

```check
Q: After both halves, δ² = 10 and the line is x = 6. Is the point (9, 4) in the strip?
* Yes, (9 − 6)² = 9 < 10
- No, it is on the right side of the line
- No, 9 − 6 = 3 is more than √10
= √10 ≈ 3.16, and the point is 3 from the line. Squares avoid the square root: 9 < 10.
```

## Brute force, for comparison

Switch **Method** to brute force and run [the same sixteen points](#example:brute-force). 120 comparisons. Divide and conquer used 23. With 16 points, either is instant, so for small n brute force is fine, and it is very hard to get wrong. The gap grows fast. At n = 1,000 it is about 500,000 pairs against something like 20,000 comparisons.

## Ties and repeats

- **Ties.** On [an even grid](#example:even-grid), every pair of neighbours is at distance 3. The strips are full, but no two strip points are less than δ apart in y, so the loop stops at once. Any one of the tied pairs is a correct answer.
- **Repeated points.** Two copies of one point are at distance 0. Once δ = 0, the strip (|x − xm| < 0) is empty. [A repeated point](#example:repeated-point)
- **Points on the line.** Points with the same x as the split can end up in either half. That's fine, as long as the y-sorted copy is split by which half each point went to, not by comparing x with xm.

## When to use it

In practice? I think most code uses a grid or a k-d tree instead: bucket the points into cells of size δ and check neighbouring cells, which is close to linear for spread-out points. The divide-and-conquer version is the one to learn because it shows how a geometric bound turns a merge step from O(n²) into O(n). It is also a lower-bound story: any comparison-based method needs Ω(n lg n), because it can tell whether n numbers are all different.

## Common mistakes

- Sorting the strip by y inside every call. That gives O(n lg² n). Still fine, just slower than it needs to be.
- Comparing each strip point with every other strip point. Then a full strip costs O(n²) and the whole point is lost.
- Using distances with square roots and floating point. Compare squared distances; with whole numbers they are exact.
- Splitting the y-sorted list by x < xm. Points with x = xm then land on the wrong side, and a half can end up empty.
- Forgetting the base case of 2 or 3 points, so a half with 1 point tries to find a pair.

## Try this

- In [sixteen points](#example:sixteen-points), predict who is in each strip before the step shows it.
- Run [across the line](#example:across-the-line) and find the call where the answer changes. Which half had it?
- Type `20` and press **Load points**, then **Find closest pair** under each method. Compare the comparisons counter with the brute force count.
