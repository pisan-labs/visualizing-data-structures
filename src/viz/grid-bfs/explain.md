# Shortest path in a grid (BFS)

You are at S in a maze and want to get to T in as few moves as possible. You can step up, down, left or right, but not through walls. Breadth-first search answers this, and it does not need a graph drawn as circles and lines. The grid is the graph.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| `GRID-BFS(grid, S, T)` | the fewest moves from S to T, and a path | O(RC) for R rows and C columns |

Every open cell is a vertex. Two open cells next to each other are joined by an edge. Every move costs the same, so the fewest moves is the fewest edges, which is exactly what BFS measures. [Show me](#play:around-the-wall)

Nobody builds the adjacency list. A cell's neighbours are the cells one row or one column away, and you work them out when you need them. That is most of what makes grid BFS different from BFS on a graph.

## How it works

1. Give S the distance d = 0 and put it in a queue.
2. Take the cell u at the front of the queue. If it is T, stop.
3. Look at u's open neighbours, clockwise from north. Each one that has no distance yet gets d = u.d + 1, remembers u as its parent, and joins the back of the queue.
4. Repeat from 2. If the queue runs dry, T cannot be reached.

The queue holds the cells at distance k at its front and the cells at distance k + 1 at its back, never anything else. So the grid fills in rings around S: all the 1s, then all the 2s, then all the 3s. In [Around the wall](#example:around-the-wall) the rings bend around the wall, and T turns up at distance 12, after BFS has expanded 60 cells. [Show me](#play:around-the-wall)

Each cell points at its parent with a small arrow. When T comes out of the queue, follow the arrows back from T to S and read the path forwards. That is the purple path at the end.

```check
Q: BFS gives a cell d = 5. What does that mean?
- It was the fifth cell to leave the queue
* The shortest way from S to that cell takes 5 moves
- It has 5 open neighbours
- There are 5 different paths to it
= d is the ring the cell is in: its distance in moves. Every cell at distance 4 was found before it.
```

## Four neighbours or eight

With **Moves** set to 4, you move like a rook that only takes one step. On [an open field](#example:open-field) the rings are diamonds, and the distance is just rows apart plus columns apart: the Manhattan distance.

Set it to 8 and diagonal moves count too, each costing one move, like a king in chess. The rings become squares. [The same grid with diagonals](#example:eight-moves) gets to T in 8 moves instead of 12. [Show me](#play:eight-moves)

Some games charge more for a diagonal (about 1.41, the square root of 2). Then moves no longer all cost the same, and BFS is the wrong tool: you want Dijkstra's algorithm or A*.

## Ties and the order of neighbours

There is often more than one shortest path. In [Many shortest paths](#example:ties), any path that only goes right and down takes 7 moves. BFS keeps whichever parent found a cell first, so the order it looks at neighbours (north, east, south, west here) decides which path you get. Change the order and you get a different path of the same length. Both answers are right.

## When to use it

Use it for mazes, game boards, robots on a floor plan, flood fill (which cells can I reach?), and puzzles where every move costs one. It is short to write and hard to get wrong.

Avoid it when moves cost different amounts: mud, roads and rivers. And on a big open map where you know where T is, A* gets there expanding far fewer cells, because it heads toward T instead of fanning out in every direction. BFS has no idea where T is. It finds out when it gets there.

## What it costs

Every open cell goes through the queue at most once, and each one checks at most 4 (or 8) neighbours. That is O(RC) time and O(RC) space for d and the parents.

The best case is [T next door](#example:next-door): 3 cells leave the queue. The worst case is [No way through](#example:no-path), where T is walled in. BFS cannot know that, so it expands every cell S can reach before it gives up. [Show me](#play:no-path)

```check
Q: T is walled in, and S can reach 40 open cells. How many cells leave the queue?
- 0, because BFS checks first whether T is reachable
- 1
* 40
- Every cell in the grid, walls included
= BFS only learns that T cannot be reached when the queue is empty, and by then every reachable cell has been through it. Walls are never added.
```

## Common mistakes

- Marking a cell when it leaves the queue instead of when it joins. Then a cell can be added several times, once by each neighbour that sees it.
- Forgetting the bounds check, so row -1 or column C walks off the grid (an index out of range, or a wrap-around to the other side).
- Mixing up rows and columns. (r, c) is row first; (x, y) is column first. Pick one and say so.
- Using a stack instead of a queue. You still visit every cell, but d is no longer the distance.
- Counting diagonals as one move and then telling someone the distance in metres.

## Try this

- [A maze](#example:maze): corridors one cell wide. How long does the queue get? [Show me](#play:maze)
- Load [Around the wall](#example:around-the-wall), switch **Moves** to 8, and run it again. Which cells change their d?
- Type your own grid, such as `S...# .##.. ....T`, and press Load.
- Open Compare and put this page next to A* on the same grid. Count the cells each one expands.
