def bidirectional_bfs(adj, radj, s, t):
    """Shortest path from s to t by BFS from both ends, one layer per turn.

    adj[u] lists u's out-neighbours, radj[v] its in-neighbours (the same lists
    when undirected), each in increasing order. Returns (path or None, number
    of vertices expanded).
    """
    if s == t:
        return [s], 0
    dist = [{s: 0}, {t: 0}]
    parent = [{}, {}]
    frontier = [[s], [t]]
    graph = [adj, radj]
    expanded, side = 0, 1
    while frontier[0] and frontier[1]:
        side = 1 - side  # take turns: s side, t side, ...
        mine, theirs = dist[side], dist[1 - side]
        layer = []
        for u in frontier[side]:
            expanded += 1
            for v in graph[side][u]:
                if v in mine:
                    continue
                mine[v] = mine[u] + 1
                parent[side][v] = u
                layer.append(v)
                if v in theirs:  # the searches meet: join the halves
                    path = [v]
                    while path[0] in parent[0]:
                        path.insert(0, parent[0][path[0]])
                    while path[-1] in parent[1]:
                        path.append(parent[1][path[-1]])
                    return path, expanded
        frontier[side] = layer
    return None, expanded
