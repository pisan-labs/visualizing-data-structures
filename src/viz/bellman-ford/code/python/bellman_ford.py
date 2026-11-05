def bellman_ford(n, edges, s):
    """Bellman-Ford shortest paths from s, as in CLRS.

    edges lists (u, v, w) for each edge u -> v, in the order to relax them. Returns d (the
    distance from s, None if unreachable), pi (the parent, None for none) and a negative
    cycle that s can reach, as a list of vertices in order (None if there is none).
    """
    d = [None] * n
    pi = [None] * n
    d[s] = 0
    for _ in range(n - 1):
        for u, v, w in edges:
            if d[u] is not None and (d[v] is None or d[u] + w < d[v]):
                d[v] = d[u] + w
                pi[v] = u
    for u, v, w in edges:
        if d[u] is not None and (d[v] is None or d[u] + w < d[v]):
            d[v] = d[u] + w
            pi[v] = u
            # Follow pi back from v until a vertex repeats: from there on it is the cycle.
            walk = []
            x = v
            while x not in walk:
                walk.append(x)
                x = pi[x]
            cycle = walk[walk.index(x):]
            cycle.reverse()
            return d, pi, cycle
    return d, pi, None
