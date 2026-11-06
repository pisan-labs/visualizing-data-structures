from collections import deque


def max_flow(cap, s, t):
    """Edmonds-Karp: Ford-Fulkerson with breadth-first search for each augmenting path.

    cap[u][v] is the capacity of the arc u -> v (0 for none). flow[u][v] is the net flow, so
    flow[v][u] == -flow[u][v] and the residual capacity is cap[u][v] - flow[u][v]. Returns the
    flow value, the number of augmenting paths, the flow matrix and the s side of a min cut.
    """
    n = len(cap)
    flow = [[0] * n for _ in range(n)]
    value = paths = 0
    while True:
        parent = [None] * n
        parent[s] = s
        queue = deque([s])
        while queue and parent[t] is None:
            u = queue.popleft()
            for v in range(n):
                if parent[v] is None and cap[u][v] - flow[u][v] > 0:
                    parent[v] = u
                    queue.append(v)
                    if v == t:
                        break
        if parent[t] is None:
            # No augmenting path: what s still reaches is the s side of a minimum cut.
            side = [v for v in range(n) if parent[v] is not None]
            return value, paths, flow, side
        b, v = float("inf"), t
        while v != s:
            u = parent[v]
            b = min(b, cap[u][v] - flow[u][v])
            v = u
        v = t
        while v != s:
            u = parent[v]
            flow[u][v] += b
            flow[v][u] -= b
            v = u
        value += b
        paths += 1
