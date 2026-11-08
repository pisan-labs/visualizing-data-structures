# k-d tree

A binary search tree sorts numbers. What do you do with points? A point has two coordinates, and there is no single order that keeps nearby points next to each other.

Bentley's answer (1975) is to take turns. The root compares points on x. Its children compare on y. Their children go back to x, and so on down the tree. Each node is a point, and it also draws a line through the plane: a vertical line at an x level, a horizontal line at a y level. Smaller goes left (or below), equal or larger goes right (or above). The k in k-d is the number of dimensions; here k = 2, so this page is a 2-d tree.

| Operation | Typical (random points) | Worst |
|---|---|---|
| insert | O(lg n) | O(n) |
| nearest neighbour | O(lg n) | O(n) |
| range search | O(√n + m) on a balanced tree | O(n) |

m is the number of points reported.

## Insert: a BST walk that changes its mind

To insert p, start at the root. At depth 0 compare p.x with the node's x; at depth 1 compare p.y with the node's y; keep alternating. When the child you want is missing, p goes there and draws its line, but only inside the cell it landed in. That is why the lines in the plane get shorter as the tree gets deeper: each one splits a piece of a piece. [Show me](#play:build-and-split)

```check
Q: The root is (6, 5) and its left child is (3, 8). Where does (4, 9) go?
- Left child of (6, 5), replacing (3, 8)
* Right child of (3, 8)
- Left child of (3, 8)
= At the root compare x: 4 < 6, go left. At (3, 8), depth 1, compare y: 9 ≥ 8, go right.
```

The shape depends on the order, as with any BST. Points on a diagonal, inserted from left to right, are larger on both coordinates every time, so every insert goes right and the tree is a path. [A path of height 7](#example:diagonal-path). Insert the same points median first and the height drops to 3. [Medians first](#example:median-order). If you have all the points up front, build it that way: sort, take the median, recurse on each half with the other coordinate.

## Nearest neighbour: the circle does the work

This is what people use k-d trees for. Given a query point q, which point is closest?

Walk down as if you were inserting q. Every node you pass is a candidate, so keep the best one so far and its distance. That best distance is a circle around q: anything closer has to be inside it. On the way back up, at each node ask one question: does the circle cross this node's line? If it does not, the whole other side of the line is farther than the best you already have. Skip it. That is the pruning. [Show me](#play:nearest-prunes)

If the circle does cross, the other side might hide something closer, and you have to look. Sometimes the answer really is over there. [Across a line](#example:nearest-across-a-line)

The test is cheap. The distance from q to a vertical line x = a is |q.x − a|. Compare its square with the best squared distance, and you never take a square root.

Turn the **Prune** option off and run the same search. It visits every node. [Without pruning](#example:no-pruning). Same answer, more work.

```check
Q: The best squared distance so far is 9. q = (4, 7) and the node's line is x = 6. Must the far side be searched?
* Yes, 2² = 4 < 9, so the circle crosses the line
- No, q is on the left side of the line
- No, the far side is always skipped once a candidate is found
= The circle has radius 3 and the line is only 2 away. A point just across it could be closer.
```

## Range search

Report every point in a rectangle. At each node: report it if it is inside, go left if the rectangle reaches the smaller side of the line, go right if it reaches the larger side. A rectangle that sits entirely on one side of a line skips everything on the other side. [Show me](#play:range-search)

On a balanced 2-d tree this costs O(√n + m). The √n comes from how many cells a rectangle's edges can cut through. Nothing fancy, but the proof is a nice exercise.

## When to use it, and when not

Use it for nearest-neighbour and range queries on points that do not change much: map lookups, collision checks in games, colour quantization, the "which store is closest" question.

Avoid it when:

- **Dimensions grow.** In 20 dimensions almost every circle crosses almost every line, pruning stops working, and you are back to checking everything. People switch to approximate methods.
- **Points move all the time.** There is no rotation that keeps the x/y alternation, so a k-d tree cannot rebalance itself like an AVL tree. Rebuild it now and then instead.
- **You delete a lot.** Deleting an inner node means finding a replacement with the smallest value on that node's axis, which can mean searching both subtrees. Doable, a bit fiddly.

A quadtree is the other common choice in 2-d. It splits a square into four equal squares instead of splitting at a point.

## Common mistakes

- Comparing on the wrong axis. The axis comes from the depth (depth mod k), not from the parent's axis plus one somewhere else in your code.
- Pruning with `<=` against the wrong thing. Skip the far side when the line is at least as far as the best distance; search it only when it is strictly closer.
- Comparing a distance with a squared distance. Square both or neither.
- Searching the far side first. You still get the right answer, but the circle stays big longer and prunes less.
- Treating equal coordinates inconsistently. Here equal goes right in insert, so range search must look right when the rectangle reaches the line itself.

## Try this

- Play [eight points](#example:build-and-split) and predict each new point's parent before the step shows it.
- In [nearest neighbour](#example:nearest-prunes), watch the circle after each new best. Which subtree gets skipped, and why?
- Run [the diagonal](#example:diagonal-path) and then [medians first](#example:median-order). Compare the height counter.
- Type `12` and press **Insert**, then type a point such as `5,5` and press **Nearest** with pruning on and off. Compare the visited counter.
