# Polygon algorithms

A polygon is a list of vertices, A, B, C and so on, with an edge from each one to the next and one more from the last back to the first. That is the whole data structure. Everything else (its area, whether a point is inside, which way it goes round) has to be computed from the list.

Four questions come up again and again, in graphics, maps and games, and each has a short O(n) answer.

| Question | Method | Cost |
|---|---|---|
| How big is it? | Shoelace formula | O(n) |
| Is q inside? | Ray casting or winding number | O(n) |
| Is it convex? | Turn test at every vertex | O(n) |
| Clockwise or not? | Turn at the lowest vertex | O(n) |

These assume a simple polygon: one whose edges meet only at shared vertices. The star on this page is not simple, and it is there to show what breaks.

## The turn test

The same test as in the [convex hull](/convex-hull/) page does most of the work:

```
TURN(a, b, c) = (b.x − a.x)(c.y − a.y) − (b.y − a.y)(c.x − a.x)
```

Positive is a left turn, negative a right turn, zero means a, b and c are on one line. It is also twice the signed area of the triangle a, b, c, which is where the area formula comes from.

## Area: the shoelace formula

Pick the origin and draw a triangle from it to every edge. Add up the signed areas of those triangles:

```
area = |Σ (x[i]·y[i+1] − x[i+1]·y[i])| / 2
```

An edge that goes counter-clockwise around the origin adds area; one that goes clockwise subtracts it. The parts of the triangles outside the polygon are added once and subtracted once, so they cancel. What is left is the polygon. The name comes from writing the coordinates in two columns and multiplying across, which looks like lacing a shoe. [Show me](#play:rectangle-area)

The sign of the sum is a free bonus: positive means counter-clockwise, negative clockwise. [The same rectangle, clockwise](#example:clockwise)

```check
Q: The shoelace sum for a polygon comes out as −24. What do you know?
- The polygon has no area
- The area is 24
* The area is 12, and the vertices go clockwise
= The area is |−24| / 2 = 12. A negative sum means the vertices are listed clockwise.
```

## Inside or outside: ray casting

Shoot a ray from q to the right and count how many edges it crosses. Every crossing takes you from outside to inside or back. Far to the right you are outside, so an odd count means q started inside. This is the even-odd rule. [Show me](#play:outside-the-dent)

The edge cases are the whole difficulty. What if the ray passes exactly through a vertex? Counting both edges that meet there gives 2 (wrong), counting neither gives 0 (also wrong). The fix is a half-open rule: an edge end that lies exactly on the ray counts as below it. At a vertex where the boundary passes through, one edge counts and the other does not. Where the boundary only touches the ray and turns back, both or neither count, which is what you want. [A ray through a vertex](#example:ray-through-vertex)

A point on the boundary is its own problem. Different programs answer differently, so this page checks for it and says so. [A point on an edge](#example:on-the-boundary)

## Winding number

The other rule counts how many times the boundary winds around q. Walk along the edges: an edge that crosses q's horizontal line going up, with q on its left, adds 1; one going down with q on its right subtracts 1. A nonzero total means inside.

For a simple polygon the two rules always agree. When edges cross, they do not. The middle of a five-pointed star is wrapped twice: two crossings (even, so outside) but winding number 2 (nonzero, so inside). The star here goes clockwise, so its count comes out as −2. Still nonzero. This is the `fill-rule` option in SVG and the canvas: `evenodd` or `nonzero`. Compare the [even-odd star](#example:star-even-odd) with the [winding star](#example:star-winding).

```check
Q: The ray from q crosses 4 edges of a simple polygon. Where is q?
* Outside
- Inside
- It depends on which way the edges go
= An even number of crossings means outside. For a simple polygon the direction does not matter.
```

## Convex or not

A polygon is convex when every vertex turns the same way. One turn the other way is a dent (a reflex vertex), and you can stop there. [An L-shape](#example:l-shape)

That check alone is not enough. The star turns right at every vertex and is clearly not convex: its edges cross. So also add up the turning angles. A convex polygon turns through exactly one full circle, 360°. The star goes round twice, 720° (−720° here, since it goes clockwise).

## Which way round

The lowest vertex (leftmost if tied) is a corner of the convex hull, so the boundary turns there the same way it does overall. One turn test at that vertex tells you clockwise or counter-clockwise. Finding the lowest vertex is O(n), the same as the shoelace sum, so both work. Pick a vertex in the middle of a dent and you get the wrong answer, which is a classic bug.

## Common mistakes

- Forgetting the closing edge from the last vertex back to the first. Every formula here needs it.
- Dividing by zero for horizontal edges in ray casting. The `(a.y > q.y) ≠ (b.y > q.y)` test skips them before any division happens.
- Using `≥` on both ends of an edge, which counts a vertex on the ray twice.
- Running any of this on a polygon whose edges cross and trusting the answer.
- Listing a vertex twice in a row. The edge between the copies has zero length and its turn means nothing.

## Try this

- [The area of a rectangle](#example:rectangle-area). Before each step, predict the sign of the next term.
- [Outside, in the dent of the L](#example:outside-the-dent). Then type your own point, such as `3 4`, and press **Inside?**.
- Switch the **Inside test** option between the two rules and replay [the winding star](#example:star-winding). Only the centre changes its answer.
- Type `8` and press **Load polygon** for a random polygon, then ask for its orientation and its area. The signs should agree.
