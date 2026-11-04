import heapq


def dijkstra(adj, s):
    """Dijkstra's shortest paths from s.

    adj[u] lists (v, w) pairs: an edge u -> v with weight w >= 0. Returns d (the distance
    from s, None if unreachable) and pi (the parent on a shortest path, None for none).
    """
    if any(w < 0 for edges in adj for _, w in edges):
        raise ValueError("Dijkstra needs weights of at least 0")
    n = len(adj)
    d = [None] * n
    pi = [None] * n
    done = [False] * n
    d[s] = 0
    q = [(0, s)]  # a binary heap of (key, vertex)
    while q:
        _, u = heapq.heappop(q)
        if done[u]:
            continue  # a stale entry: u was settled with a smaller key
        done[u] = True
        for v, w in adj[u]:
            if d[v] is None or d[u] + w < d[v]:
                d[v] = d[u] + w
                pi[v] = u
                heapq.heappush(q, (d[v], v))
    return d, pi
