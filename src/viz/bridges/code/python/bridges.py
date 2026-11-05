def cuts_and_bridges(adj):
    """Cut vertices and bridges of an undirected graph, by Tarjan's low-link DFS.

    adj[u] lists u's neighbours in increasing order. Returns (cuts, bridges):
    the cut vertices in increasing order, and the bridges as (u, v) pairs with
    u the parent, in the order DFS finds them.
    """
    n = len(adj)
    d = [None] * n
    low = [0] * n
    cuts, bridges = set(), []
    time = 0

    def visit(u, p):
        nonlocal time
        time += 1
        d[u] = low[u] = time
        children = 0
        for v in adj[u]:
            if d[v] is None:
                children += 1
                visit(v, u)
                low[u] = min(low[u], low[v])
                if low[v] > d[u]:
                    bridges.append((u, v))
                if p is not None and low[v] >= d[u]:
                    cuts.add(u)
            elif v != p:  # a back edge (the parent edge does not count)
                low[u] = min(low[u], d[v])
        return children

    for u in range(n):
        if d[u] is None and visit(u, None) >= 2:  # the root rule
            cuts.add(u)
    return sorted(cuts), bridges
