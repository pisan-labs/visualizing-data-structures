def strongly_connected_components(adj):
    """Kosaraju's algorithm, as in CLRS.

    adj[u] lists the vertices u points to, in increasing order. Returns the
    components in the order the second pass finds them (a topological order of
    the component graph), each sorted.
    """
    n = len(adj)
    seen = [False] * n
    finished = []  # vertices in the order they finish

    def visit(u, graph, out):
        seen[u] = True
        for v in graph[u]:
            if not seen[v]:
                visit(v, graph, out)
        out.append(u)

    for u in range(n):  # pass 1: DFS(G)
        if not seen[u]:
            visit(u, adj, finished)

    transpose = [[] for _ in range(n)]
    for u in range(n):
        for v in adj[u]:
            transpose[v].append(u)  # u is visited in order, so each list stays sorted

    seen = [False] * n
    components = []
    for u in reversed(finished):  # pass 2: DFS(G^T), latest finish first
        if not seen[u]:
            component = []
            visit(u, transpose, component)
            components.append(sorted(component))
    return components
