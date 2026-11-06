def two_sat(n, clauses):
    """Solve 2-SAT with Kosaraju's strongly connected components.

    Variables are 0..n-1; literal 2*i means x_i and 2*i + 1 means not x_i.
    clauses lists (a, b) literal pairs, each meaning (a or b). Returns a list
    of booleans, or None when the formula is unsatisfiable.
    """
    m = 2 * n
    arcs = [set() for _ in range(m)]
    for a, b in clauses:
        arcs[a ^ 1].add(b)  # not a implies b
        arcs[b ^ 1].add(a)  # not b implies a
    adj = [sorted(s) for s in arcs]

    seen = [False] * m

    def visit(u, graph, out):
        seen[u] = True
        for v in graph[u]:
            if not seen[v]:
                visit(v, graph, out)
        out.append(u)

    finished = []
    for u in range(m):  # pass 1: DFS(G)
        if not seen[u]:
            visit(u, adj, finished)

    transpose = [[] for _ in range(m)]
    for u in range(m):
        for v in adj[u]:
            transpose[v].append(u)

    seen = [False] * m
    comp = [-1] * m  # components numbered in topological order
    count = 0
    for u in reversed(finished):  # pass 2: DFS(G^T), latest finish first
        if not seen[u]:
            members = []
            visit(u, transpose, members)
            for v in members:
                comp[v] = count
            count += 1

    if any(comp[2 * i] == comp[2 * i + 1] for i in range(n)):
        return None
    return [comp[2 * i] > comp[2 * i + 1] for i in range(n)]
