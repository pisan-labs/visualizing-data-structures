from collections import deque


def push_relabel(cap, s, t):
    """FIFO push-relabel: flood the arcs out of s, then push excess one level downhill.

    cap[u][v] is the capacity of the arc u -> v (0 for none). flow[u][v] is the net flow, so
    flow[v][u] == -flow[u][v] and the residual capacity is cap[u][v] - flow[u][v]. Returns the
    flow value, the numbers of pushes and relabels, the flow matrix and the s side of a min cut.
    """
    n = len(cap)
    flow = [[0] * n for _ in range(n)]
    height, excess, current = [0] * n, [0] * n, [0] * n
    nbrs = [[v for v in range(n) if cap[u][v] or cap[v][u]] for u in range(n)]
    height[s] = n
    queue = deque()
    for v in range(n):  # the preflow: fill every arc out of s
        if cap[s][v] > 0:
            flow[s][v], flow[v][s] = cap[s][v], -cap[s][v]
            excess[v] += cap[s][v]
            excess[s] -= cap[s][v]
            if v != t:
                queue.append(v)
    pushes = relabels = 0
    while queue:
        u = queue.popleft()
        while excess[u] > 0:  # discharge u
            if current[u] == len(nbrs[u]):  # relabel: one above the lowest residual neighbour
                height[u] = 1 + min(height[v] for v in nbrs[u] if cap[u][v] - flow[u][v] > 0)
                current[u] = 0
                relabels += 1
                continue
            v = nbrs[u][current[u]]
            room = cap[u][v] - flow[u][v]
            if room > 0 and height[u] == height[v] + 1:  # admissible: push
                d = min(excess[u], room)
                flow[u][v] += d
                flow[v][u] -= d
                excess[u] -= d
                excess[v] += d
                pushes += 1
                if v != s and v != t and excess[v] == d:  # v just started to overflow
                    queue.append(v)
            else:
                current[u] += 1
    # What s still reaches in the residual network is the s side of a minimum cut.
    side, todo = {s}, [s]
    while todo:
        u = todo.pop()
        for v in range(n):
            if v not in side and cap[u][v] - flow[u][v] > 0:
                side.add(v)
                todo.append(v)
    return excess[t], pushes, relabels, flow, sorted(side)
