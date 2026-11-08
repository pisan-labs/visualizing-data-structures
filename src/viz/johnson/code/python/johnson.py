import heapq

INF = float("inf")


def johnson(n, arcs):
    """All-pairs shortest distances, or None if there is a negative cycle.

    arcs lists (u, v, w) for vertices 0..n-1 (an undirected edge is two arcs).
    """
    # Bellman-Ford from a new vertex q with a 0 arc to every vertex: h starts at 0.
    h = [0] * n
    for _ in range(n):
        changed = False
        for u, v, w in arcs:
            if h[u] + w < h[v]:
                h[v] = h[u] + w
                changed = True
        if not changed:
            break
    if any(h[u] + w < h[v] for u, v, w in arcs):
        return None  # negative cycle

    out = [[] for _ in range(n)]  # reweighted: w' = w + h(u) - h(v) >= 0
    for u, v, w in arcs:
        out[u].append((v, w + h[u] - h[v]))
    dist = []
    for s in range(n):
        d = [INF] * n
        d[s] = 0
        heap = [(0, s)]
        while heap:
            du, u = heapq.heappop(heap)
            if du > d[u]:
                continue  # stale entry
            for v, w in out[u]:
                if du + w < d[v]:
                    d[v] = du + w
                    heapq.heappush(heap, (d[v], v))
        dist.append([d[t] - h[s] + h[t] if d[t] < INF else INF for t in range(n)])
    return dist
