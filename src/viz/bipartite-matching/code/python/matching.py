def max_matching(adj, n_right):
    """Kuhn's algorithm: an augmenting path search from each left vertex in turn.

    adj[u] lists the right vertices joined to left vertex u, in order. Returns the size of a
    maximum matching and match_r, where match_r[v] is the left partner of v (None if free).
    """
    match_r = [None] * n_right

    def try_match(u, visited):
        for v in adj[u]:
            if not visited[v]:
                visited[v] = True
                # v is free, or its partner can move to another right vertex.
                if match_r[v] is None or try_match(match_r[v], visited):
                    match_r[v] = u
                    return True
        return False

    size = 0
    for u in range(len(adj)):
        if try_match(u, [False] * n_right):
            size += 1
    return size, match_r
