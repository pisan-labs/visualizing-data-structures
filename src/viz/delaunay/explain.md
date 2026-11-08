# Delaunay triangulation and Voronoi

Connect a set of points into triangles so that no edges cross and the whole convex hull is covered. There are many ways to do it. Most of them are full of long, skinny triangles, which are bad news for anything that interpolates over them: terrain maps, finite-element meshes, the shading in a game.

The Delaunay triangulation (Boris Delaunay, 1934) is the one that avoids skinny triangles as much as possible. It has one defining rule:

> No point lies inside the circumcircle of any triangle.

The circumcircle is the circle through a triangle's three corners. Every triangle's circle is empty. Among all triangulations of the points, this one maximizes the smallest angle.

| | Size or cost |
|---|---|
| triangles | 2n − 2 − h (h points on the hull) |
| edges | 3n − 3 − h |
| build, randomized incremental | O(n lg n) expected |
| build, this page (tests every triangle) | O(n²) |

## Bowyer–Watson: add a point, fix the hole

Start with one huge triangle that contains everything, the super triangle. Then add the points one at a time:

1. Find every triangle whose circumcircle contains the new point. They are now **bad**: they break the rule.
2. The bad triangles form one connected hole around the point. Remove them.
3. Join the new point to every edge on the hole's boundary.

The new triangles all have empty circles, and the rest of the triangulation was already fine. [Show me](#play:ten-points), or start smaller with [a new point inside a triangle](#example:add-a-point).

At the end, throw away every triangle that touches the super triangle. On this page its corners sit 10,000 units away, which for points between 0 and 12 behaves like infinity. The dashed lines leaving the drawing while a point goes in are edges to those far corners.

```check
Q: A new point lands inside a triangle, and inside no other triangle's circle. How many new triangles replace it?
- 1
- 2
* 3
- 4
= One bad triangle, a hole with 3 edges, and the point is joined to each: 3 triangles.
```

## The empty-circle check

Press **Check empty circles** to test the rule directly: every triangle against every other point. [Every circle is empty](#example:empty-circle-check)

All in-circle tests here are exact. The test is a 3 × 3 determinant whose terms grow with the fourth power of the coordinates, so the code uses whole numbers (BigInt in the browser, 64-bit integers in Java and C++). With floating point, a point very close to a circle can land on either side, and the triangulation gets inconsistent. Those bugs show up once a month and never in a debugger.

## Ties: points on one circle

Four corners of a square are on one circle. Split it along either diagonal: both triangles have the fourth point *on* the circle, not inside. Both are Delaunay. The triangulation is unique only when no four points are cocircular. [Four points on one circle](#example:four-on-a-circle)

The test here treats "on the circle" as fine (strictly inside is bad), so it keeps whichever diagonal it made first. Grids are full of these ties; try the **A grid** preset.

## The Voronoi diagram is the dual

Give each point the region of the plane closer to it than to any other point. Those regions are its **Voronoi cells**. Cell phone towers, nearest hospital maps, how cells in a leaf pack together: same picture.

Turn on **Show the Voronoi diagram**. [The Voronoi diagram is the dual](#example:voronoi-dual)

- Each triangle's circumcentre is a Voronoi vertex: it is equally far from the triangle's three corners, and (empty circle!) no other point is closer.
- Each Delaunay edge crosses a Voronoi edge at a right angle. Two points share a Voronoi border exactly when they are joined by a Delaunay edge.
- Points on the convex hull have cells that go on forever.

So if you have one, you have the other in O(n). I think that's the most useful thing to remember from this page.

```check
Q: Two points share a Voronoi border. What do you know about them?
* They are joined by an edge of the Delaunay triangulation
- They are the closest pair of points
- They are both on the convex hull
= Dual structures: Voronoi borders and Delaunay edges come in pairs. The closest pair is always one of those edges, but most edges are not the closest pair.
```

## When to use it, and when not

Use it for meshes, terrain from scattered height samples, nearest-neighbour graphs, and as a first step for a minimum spanning tree of points (the Euclidean MST is a subset of the Delaunay edges).

Be careful with:

- **Points on a line.** No triangles at all, until one point steps off it. [Collinear start](#example:collinear-start)
- **Insertion order.** Points added in sorted order, or around a circle, can make each insert rebuild a big region. Shuffle first.
- **Constraints.** If certain edges must appear (a coastline, a wall), plain Delaunay may cut through them. That's the constrained Delaunay triangulation, a different algorithm.

## Common mistakes

- A super triangle that is too small. Its corners leak into the result, and hull edges go missing.
- Getting the orientation wrong. The in-circle sign flips for a clockwise triangle.
- Forgetting that the hole's boundary edges keep their direction, so new triangles come out clockwise.
- Testing only the triangle that contains the new point. Points outside it can still spoil neighbouring circles.

## Try this

- Play [ten points](#example:ten-points). Before each insert, guess how many triangles will turn bad.
- Turn on the Voronoi diagram and step through again. Watch the cells shrink as their neighbours arrive.
- Type `3,3 9,3 9,9 3,9` into an empty page and press **Insert**, then **Check empty circles**. Then insert `6,6`.
