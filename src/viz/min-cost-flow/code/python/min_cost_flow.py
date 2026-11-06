INF = float("inf")


def min_cost_flow(cap, cost, s, t, want=0):
    """Successive shortest paths, with Bellman-Ford for each cheapest path.

    cap[u][v] and cost[u][v] describe the arc u -> v (0 capacity for none; no pair of vertices
    has arcs both ways). flow[u][v] is the net flow, so flow[v][u] == -flow[u][v]. A residual
    arc u -> v costs cost[u][v] when it is a real arc and -cost[v][u] when it sends flow back.
    want == 0 sends as much as possible. Returns the flow value, the total cost, the number of
    paths and the flow matrix.
    """
    n = len(cap)
    flow = [[0] * n for _ in range(n)]
    w = [[cost[u][v] if cap[u][v] > 0 else -cost[v][u] for v in range(n)] for u in range(n)]
    value = total = paths = 0
    while want == 0 or value < want:
        d = [INF] * n
        parent = [None] * n
        d[s] = 0
        for _ in range(n - 1):
            changed = False
            for u in range(n):
                if d[u] == INF:
                    continue
                for v in range(n):
                    if cap[u][v] - flow[u][v] > 0 and d[u] + w[u][v] < d[v]:
                        d[v] = d[u] + w[u][v]
                        parent[v] = u
                        changed = True
            if not changed:
                break
        if d[t] == INF:
            break
        b, v = (want - value if want else INF), t
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
        total += b * d[t]
        paths += 1
    return value, total, paths, flow
