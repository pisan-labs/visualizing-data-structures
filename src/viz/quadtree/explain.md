# Quadtree

Take a square with some points in it. If it holds too many, cut it into four equal squares and give each point to the square it falls in. Do the same to each of those squares. That's a quadtree: a tree where every inner node has exactly four children, NW, NE, SW and SE, and every leaf is a square with a few points in it.

Games use them to answer "what is near the player?" without checking every object in the level. Maps use them to decide which tiles to draw. Image compression uses the same idea on pixels: a square that is all one colour stays a leaf.

| Operation | Cost |
|---|---|
| insert | O(d), d the depth |
| range query | O(√n + m) for spread-out points; O(n) worst |
| depth d | at most lg(s/δ) + 1, side s, closest pair δ apart |

## Insert and split

This page uses a 16 × 16 square and whole-number points from 0 to 15. Each leaf has a **capacity**, a bucket size. To insert p, walk down from the root, each time picking the quarter that holds p: x below or above the middle, then y below or above the middle. Put p in the leaf you reach. If the leaf now holds more than its capacity, split it: four children with half the side, and every point moves into its quarter. If all the points went into the same quarter, split that one too. [Show me](#play:split-on-overflow)

The splits do not depend on the points' values the way a k-d tree's do. The lines are always at the middle of the square. That makes the code short and the pictures tidy, and it is also the weakness.

```check
Q: Capacity 1. The tree is one leaf holding (2, 13). Insert (13, 2). How many nodes does the tree have now?
- 2
* 5
- 9
= (2, 13) is in the NW quarter and (13, 2) in the SE quarter. One split separates them: the root plus four children.
```

## Close points go deep

How deep is a quadtree with n points? It does not depend on n. It depends on how close the closest points are. Two points one step apart keep landing in the same quarter: 16, 8, 4, 2, and finally squares of side 1 tell them apart. Four splits, three empty leaves at every level, for two points. [Two close points](#example:close-pair-goes-deep)

That's why the depth bound is lg(s/δ): halve the side s until it is smaller than the gap δ. With real numbers instead of a grid, two points can be as close as you like, so the depth has no bound at all. Real implementations stop at a maximum depth and let the leaf overflow.

Bigger buckets help. With capacity 3, the same eight points need one split instead of four. [Buckets of three](#example:buckets-of-three). The price is that a query tests more points per leaf. Nothing fancy, just a trade.

## Range query

To report the points in a rectangle, start at the root. If a square misses the rectangle, skip it and everything under it. If it is an inner node, try its four children. If it is a leaf, test each of its points. [Show me](#play:range-query)

The skipping is the whole point. In the example the query tests 4 of 8 points. With thousands of points spread around, a small rectangle touches a handful of leaves.

When the rectangle covers everything, there is nothing to skip, and every node is visited. [Clusters](#example:clusters)

```check
Q: A square [8, 16) × [0, 8) and the rectangle x from 2 to 7, y from 1 to 13. Does the query go into the square?
- Yes, the rectangle's y range overlaps the square's
* No, the rectangle ends at x = 7 and the square starts at x = 8
- Only if the square has points
= Both ranges have to overlap. On x they don't, so the whole square is skipped.
```

## Region quadtrees and point quadtrees

What this page draws is a **point-region (PR) quadtree**: the regions are fixed (always halves of halves), and points live in the leaves. A **region quadtree** is the same idea for areas instead of points, such as an image split until each square is one colour.

The original **point quadtree** (Finkel and Bentley, 1974) is different: every node is a point, and it splits its region into four at that point, not at the middle. It is the 4-way cousin of the k-d tree. Its shape depends on the insertion order, like a BST, and deleting from it is painful. I think the PR version is easier to teach and easier to get right.

## When to use it, and when not

Use a quadtree when points are spread fairly evenly, the space has a natural boundary (a game level, a map tile), and you want simple code for "what is in this area?" or "what is near here?". It also handles moving objects reasonably: remove from one leaf, insert into another.

Avoid it when points cluster tightly (deep, mostly empty trees), when you need more than two or three dimensions (an octree has 8 children; in 10 dimensions you would have 1,024), or when you need guaranteed balance. A k-d tree splits at the data instead of the middle and copes better with clusters.

## Common mistakes

- Closed squares. A point exactly on the middle line has to go to one side only. Here the square [x0, x0 + s) includes its left and bottom edges and not its right and top ones.
- No depth limit with real-number coordinates. Two copies of one point split forever. This page refuses duplicates, and on a whole-number grid, a square of side 1 holds one point.
- Forgetting to move the old points down when splitting, so they sit in an inner node and queries miss them.
- Testing every point in an overlapping inner node instead of recursing into its children.

## Try this

- Play [split on overflow](#example:split-on-overflow) and predict which insert causes each split.
- Set **Leaf capacity** to 2 and replay it. Count the nodes.
- Insert `8,8 9,9` into an empty tree, then `8,9`. How many nodes does the third point add?
- Try the **Two clusters** preset, then a range query over one cluster only, such as `0,0 4,4`. Compare the tests counter with the number of points.
