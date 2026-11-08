def pagerank(n, links, d=0.85, spread=True, tol=0.001, max_iter=100):
    """PageRank by power iteration.

    links[u] lists the vertices u links to (0..n-1). Rank on dangling
    vertices (no links out) is spread evenly, or dropped when spread is False.
    Returns the ranks and the number of iterations.
    """
    into = [[] for _ in range(n)]
    for u in range(n):
        for v in links[u]:
            into[v].append(u)
    rank = [1 / n] * n
    for it in range(1, max_iter + 1):
        dangling = 0.0
        for u in range(n):
            if not links[u]:
                dangling += rank[u]
        new = []
        for v in range(n):
            s = 0.0
            for u in sorted(into[v]):
                s += rank[u] / len(links[u])
            new.append((1 - d) / n + d * (s + dangling / n if spread else s))
        change = 0.0
        for v in range(n):
            change += abs(new[v] - rank[v])
        rank = new
        if change < tol:
            break
    return rank, it
