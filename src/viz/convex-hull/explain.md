# Convex hull

Hammer some nails into a board, stretch a rubber band around all of them, and let go. The band snaps onto the outermost nails. That shape is the convex hull: the smallest convex polygon that contains every point.

The hull shows up whenever you need the outline of a cloud of points. Collision detection wraps objects in hulls because testing two convex shapes is cheap. Robots plan paths around them. The farthest pair of points (the diameter of the set) is always two corners of the hull, so finding the hull first turns an O(n²) search into something much faster.

## The one test you need

Every hull algorithm is built from a single question: going from a to b to c, do you turn left or right?

```
TURN(a, b, c) = (b.x − a.x)(c.y − a.y) − (b.y − a.y)(c.x − a.x)
```

This is the cross product of b − a and c − a. Positive means a left turn (counter-clockwise), negative means a right turn, and zero means the three points are on one line. Two multiplications and a subtraction. No angles, no square roots, no division. With whole-number coordinates the answer is exact, which matters a lot for the collinear case.

```check
Q: TURN(a, b, c) for a = (0, 0), b = (2, 0), c = (2, 3)?
- −6, a right turn
* 6, a left turn
- 0, collinear
= (2 − 0)(3 − 0) − (0 − 0)(2 − 0) = 6. Going east then north is a left turn.
```

## Graham scan

Graham's idea (1972) is to sort first, so the hard part becomes a single pass.

1. Pick p0, the lowest point (the leftmost one if two are lowest). Nothing is below it, so it must be a corner.
2. Sort the other points by the angle they make with p0, counter-clockwise. Comparing two angles is one turn test, so no trigonometry is needed.
3. Walk through the points in that order with a stack. Before pushing a point p, look at the top two points of the stack. If they and p do not make a left turn, the top point cannot be a corner: pop it and check again. Then push p.

When the walk ends, the stack holds the hull, counter-clockwise. [Show me](#play:small-set)

Each point is pushed once and popped at most once, so the scan is O(n). The sort is O(n lg n), and that is the cost of the whole thing.

## The monotone chain

Andrew's version (1979) sorts by x instead of by angle, which is a little easier to get right. It builds the lower hull from left to right with the same stack rule, then the upper hull from right to left. Glue them together, dropping the repeated end points, and you have the hull. Same O(n lg n), and the comparisons are plain coordinate comparisons. [Try it](#example:monotone-chain)

## Gift wrapping

The Jarvis march (1973) does no sorting at all. Start at the leftmost point. Guess any other point as the next corner, then try every point: if one is to the right of the line from here to the guess, it becomes the new guess. When you have tried them all, the guess is the next corner. Move there and repeat until you are back where you started.

Each corner costs a pass over all n points, so the total is O(nh), where h is the number of corners. That is output-sensitive. With a handful of corners it beats sorting ([four corners](#example:few-corners)). With every point on the hull, h = n and it is O(n²). [Show me](#play:all-on-hull)

```check
Q: 100 points lie on a circle. Which algorithm is slowest?
- Graham scan
- The monotone chain
* Gift wrapping
= Every point is a corner, so gift wrapping does about 100 passes of 98 tests each. The other two sort and scan in O(n lg n).
```

## When to use which

Graham scan and the monotone chain are the default choices: O(n lg n) whatever the points look like, short to write, and there is a matching lower bound (a hull algorithm can be used to sort, so you cannot beat n lg n in the worst case). I suggest the monotone chain when you write it yourself; sorting by x is harder to get wrong than sorting by angle.

Gift wrapping is worth it when you know h is small, or when you only need the first few corners. It is also the easiest to explain to someone over coffee.

## Collinear and repeated points

This is where most hull code breaks.

- **Points on an edge.** Is the midpoint of a hull edge a corner? Here it is not: the scans pop on a turn test of zero, not only on a negative one. Some applications want those points kept. Then you pop only on a right turn, and you have to be careful with the last ray from p0. [Show me](#play:collinear-edge)
- **Points on one ray from p0.** Graham's sort cannot order them by angle, since the angles are equal. CLRS keeps only the farthest one. If you keep them all, sort the nearer ones first.
- **Repeated points.** Two copies of one point make a zero-length edge and turn tests that mean nothing. Remove duplicates first. [Repeated points](#example:duplicates)
- **Everything on one line.** The hull is a segment with two end points. Code that assumes at least three corners crashes here. [Every point on one line](#example:all-collinear)

## Common mistakes

- Computing angles with `atan2` and comparing floating-point numbers. Nearly collinear points then sort in whatever order the rounding picks. Use the turn test.
- Popping only on a right turn without thinking about collinear points.
- Forgetting the tie-break when choosing p0 (lowest, then leftmost). Two lowest points and the wrong choice give a "hull" that turns right at the start.
- Integer overflow in the turn test with large coordinates. The product of two differences needs twice as many bits as one coordinate.

## Try this

- [Graham scan on nine points](#example:small-set). Before each turn test, guess whether the top of the stack survives.
- [Points on an edge and on a ray](#example:collinear-edge). Count how many points are set aside after the sort and how many are popped.
- Switch the **Algorithm** option to gift wrapping and replay [four corners](#example:few-corners), then [every point a corner](#example:all-on-hull). Compare the turn test counters.
- Type `12` in the box and press **Load points**, then **Find hull** under each algorithm. They always find the same corners. The work differs.
