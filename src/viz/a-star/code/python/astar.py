import heapq
import math

# Clockwise from north. The even entries are the four straight moves.
MOVES = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]

HEURISTICS = {
    "manhattan": lambda dr, dc: dr + dc,
    "euclidean": lambda dr, dc: math.sqrt(dr * dr + dc * dc),
    "chebyshev": lambda dr, dc: max(dr, dc),
    "zero": lambda dr, dc: 0,
}


def astar(grid, heuristic="manhattan", w=1.0, eight=False):
    """A* from S to T in a grid of strings ('.' open, '#' wall); every move costs 1.

    Returns (path, expanded): the cells (r, c) from S to T, or None if T
    cannot be reached, and how many cells were expanded. Ties on f go to the
    smaller h, then to the entry added first.
    """
    rows, cols = len(grid), len(grid[0])
    cells = [(r, c) for r in range(rows) for c in range(cols)]
    s = next(p for p in cells if grid[p[0]][p[1]] == "S")
    t = next(p for p in cells if grid[p[0]][p[1]] == "T")
    guess = HEURISTICS[heuristic]

    def h(p):
        return guess(abs(p[0] - t[0]), abs(p[1] - t[1]))

    moves = MOVES if eight else MOVES[0::2]
    g = {s: 0}
    parent = {s: None}
    closed = set()
    count = 0  # breaks the last ties: first added, first out
    heap = [(w * h(s), h(s), count, s)]
    while heap:
        _, _, _, u = heapq.heappop(heap)
        if u in closed:
            continue  # an older, worse entry for a cell already expanded
        closed.add(u)
        if u == t:
            path = []
            while u is not None:
                path.append(u)
                u = parent[u]
            return path[::-1], len(closed)
        for dr, dc in moves:
            v = (u[0] + dr, u[1] + dc)
            if not (0 <= v[0] < rows and 0 <= v[1] < cols) or grid[v[0]][v[1]] == "#":
                continue
            if v in closed:
                continue
            cost = g[u] + 1
            if v not in g or cost < g[v]:
                g[v] = cost
                parent[v] = u
                count += 1
                heapq.heappush(heap, (cost + w * h(v), h(v), count, v))
    return None, len(closed)
