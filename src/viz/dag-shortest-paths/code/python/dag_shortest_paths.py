WHITE, GRAY, BLACK = 0, 1, 2


def topological_sort(adj):
    """Vertices in topological order, by depth-first search as in CLRS.

    adj[u] lists (v, w) pairs. Returns (order, None), or (None, cycle) when an edge leads
    back to a vertex the search is still inside of: the cycle starts at that vertex.
    """
    n = len(adj)
    color = [WHITE] * n
    order, path = [], []

    def visit(u):
        color[u] = GRAY
        path.append(u)
        for v, _ in adj[u]:
            if color[v] == GRAY:
                return path[path.index(v):]
            if color[v] == WHITE:
                cycle = visit(v)
                if cycle:
                    return cycle
        color[u] = BLACK
        path.pop()
        order.insert(0, u)  # put u at the front of the list
        return None

    for u in range(n):
        if color[u] == WHITE:
            cycle = visit(u)
            if cycle:
                return None, cycle
    return order, None


def dag_shortest_paths(adj, s):
    """Shortest paths from s in a DAG: relax each vertex's edges in topological order.

    Returns d (None if unreachable) and pi. Raises ValueError(cycle) if G has a cycle.
    """
    order, cycle = topological_sort(adj)
    if cycle:
        raise ValueError(cycle)
    d = [None] * len(adj)
    pi = [None] * len(adj)
    d[s] = 0
    for u in order:
        if d[u] is None:
            continue
        for v, w in adj[u]:
            if d[v] is None or d[u] + w < d[v]:
                d[v] = d[u] + w
                pi[v] = u
    return d, pi
