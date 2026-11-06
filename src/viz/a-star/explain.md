# A* search

BFS and Dijkstra's algorithm find the shortest path to T by searching outward in every direction, including directions that lead away from T. If you know roughly where T is, that is a lot of wasted work. A* uses a guess about the distance to T to search the promising cells first.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| `A*(grid, S, T)` | a path from S to T, shortest when h never overestimates | O(k log k) for the k cells it expands |

Every cell A* finds gets three numbers:

- **g**: the cost of the best path from S to this cell found so far;
- **h**: a guess at the cost from this cell to T, the heuristic;
- **f = g + h**: a guess at the cost of the whole trip through this cell.

A* keeps the cells it has found but not yet expanded in an open set, a priority queue ordered by f. It always expands the cell with the least f. When T comes out, the search is over. [Show me](#play:manhattan)

In the drawing, f is in the middle of a cell, g at its top left and h at its top right. Open cells are teal, closed cells are green, and the cell being expanded is blue.

## How it works

1. S gets g = 0 and f = h(S). It is the only open cell.
2. Take the open cell u with the least f. Ties go to the smaller h, then to the cell added first. If u is T, follow the parents back: done.
3. Close u. For each open neighbour v that is not closed, the cost through u is g' = u.g + 1. If v is new, or g' beats its g, set v.g = g', v.π = u and v.f = g' + h(v), and put v in the open set.
4. Repeat from 2. If nothing is open, there is no path.

That is Dijkstra's algorithm with one change: the queue is ordered by g + h instead of g.

```check
Q: Cell C4 has g = 3 and h = 5. What is its f?
- 3
- 5
* 8
- 15
= f = g + h: 3 moves to get here, and a guess of 5 more to get to T.
```

## Choosing h

On a grid where you move up, down, left and right, the **Manhattan distance** (rows apart plus columns apart) is the natural guess. It ignores walls, so it never overestimates: any real path is at least that long. In [Manhattan heads for T](#example:manhattan), A* runs at the wall, works around it, and expands 22 cells for a path of 12 moves.

Now set **Heuristic h** to zero. f is just g, and A* is Dijkstra's algorithm. [The same grid with h = 0](#example:zero-heuristic) expands 60 cells for a path of the same length. The guess saved 38 cells of work. [Show me](#play:zero-heuristic)

The other choices:

- **Euclidean**, the straight-line distance, never overestimates with 4 moves either, but it is smaller than Manhattan, so it guides less and expands more.
- **Chebyshev**, the larger of rows and columns apart, is exact on an open grid with 8 moves.

The better the guess, the less work. A perfect h expands only the path. In [A straight line](#example:straight-line), A* expands 10 cells for a path of 9 moves, and h = 0 expands 27.

## When the guess is too big

If h never overestimates the real cost to T, it is called admissible, and A* returns a shortest path. If it overestimates, all bets are off.

With **Moves** set to 8, a diagonal step costs 1, but Manhattan counts it as 2. In [Manhattan with diagonals](#example:diagonal-overestimate), A* returns a path of 12 moves when 9 would do. [Show me](#play:diagonal-overestimate) Euclidean overestimates with diagonals too (it counts a diagonal as 1.41). Chebyshev does not.

Sometimes you overestimate on purpose. With **Weight** above 1, f = g + w·h trusts the guess more than the cost so far. [Weight 5](#example:weighted) expands 30 cells instead of the 46 Dijkstra needs, and pays with a path of 21 moves where 13 would do. Games do this all the time. A path that is a bit long and found now beats a perfect path found next frame.

```check
Q: Every move costs 1, with diagonals allowed. Which h can make A* return a path that is not the shortest?
- h = 0
- Chebyshev: max(rows apart, columns apart)
* Manhattan: rows apart plus columns apart
= With diagonals, Manhattan counts one diagonal step as 2 when it costs 1, so it overestimates. h = 0 and Chebyshev never do.
```

## When to use it

Use A* when you know where the target is and can guess the distance to it cheaply: maps, games, robot planning, puzzles like the 15-puzzle. It is the standard answer for "find a path on a map".

Avoid it when you need distances to every cell (use BFS or Dijkstra), when there is no good guess (then h = 0 and you have Dijkstra with extra bookkeeping), or when memory is tight. A* keeps every cell it has seen, open or closed, and on a big map that, not time, is what runs out first.

## What it costs

Each expansion takes a cell from a priority queue, O(log k) with a binary heap, and looks at up to 4 or 8 neighbours. So A* costs O(k log k) for the k cells it expands, and how small k is depends on h.

There is no free lunch when T cannot be reached. In [No way through](#example:no-path), A* expands every cell S can reach before the open set runs dry, exactly like BFS. A guess about the distance to T is no help when there is no way to T. [Show me](#play:no-path)

## Common mistakes

- Stopping when T is added to the open set instead of when it comes out. A cheaper path to T may still turn up.
- Using a heuristic that overestimates and expecting a shortest path.
- Mixing units: if a move costs 10 and h counts cells, h is ten times too small (safe, but slow).
- Forgetting to update a cell that is already open when a cheaper path to it turns up.
- Breaking ties at random. Preferring the smaller h, as here, keeps A* on the straight line in [An open field](#example:open-field) instead of filling the whole rectangle.

## Try this

- Load [Manhattan heads for T](#example:manhattan). Before each step, say which open cell has the least f.
- Switch **Heuristic h** between all four and write down the cells expanded. Does the path change?
- Put this page next to the grid BFS page in Compare mode and run both on the same grid.
- Make your own trap: a long wall right in front of T. How many extra cells does Manhattan expand?
