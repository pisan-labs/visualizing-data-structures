def euler_path(n, edges, directed):
    """An Euler path or circuit by Hierholzer's algorithm, or None.

    edges lists (u, v) for vertices 0..n-1. Each vertex tries its edges in
    order of the far end, then of the list.
    """
    out = [[] for _ in range(n)]  # (far end, edge index)
    balance = [0] * n  # out - in, or the degree when undirected
    for i, (u, v) in enumerate(edges):
        out[u].append((v, i))
        balance[u] += 1
        if directed:
            balance[v] -= 1
        else:
            out[v].append((u, i))
            balance[v] += 1
    for lst in out:
        lst.sort()
    if not edges or not one_piece(n, edges):
        return None
    if directed:
        bad = [v for v in range(n) if balance[v] != 0]
        if bad and sorted(balance[v] for v in bad) != [-1, 1]:
            return None
        start = next((v for v in bad if balance[v] == 1), None)
    else:
        bad = [v for v in range(n) if balance[v] % 2 == 1]
        if len(bad) not in (0, 2):
            return None
        start = bad[0] if bad else None
    if start is None:
        start = next(v for v in range(n) if out[v])

    used, nxt = [False] * len(edges), [0] * n
    stack, circuit = [start], []
    while stack:
        v = stack[-1]
        while nxt[v] < len(out[v]) and used[out[v][nxt[v]][1]]:
            nxt[v] += 1
        if nxt[v] < len(out[v]):  # walk an unused edge
            w, i = out[v][nxt[v]]
            used[i] = True
            stack.append(w)
        else:  # stuck: v goes at the front of the circuit
            circuit.append(stack.pop())
    return circuit[::-1]


def one_piece(n, edges):
    """Are all vertices with an edge connected (ignoring directions)?"""
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    start = next(v for v in range(n) if adj[v])
    seen, stack = {start}, [start]
    while stack:
        for w in adj[stack.pop()]:
            if w not in seen:
                seen.add(w)
                stack.append(w)
    return all(v in seen for v in range(n) if adj[v])
