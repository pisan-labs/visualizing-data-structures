def hungarian(cost):
    """Cheapest assignment of n rows to n columns (the Hungarian algorithm).

    Returns mate, where mate[i] is the column given to row i. Potentials u
    and v keep u[i] + v[j] <= cost[i][j]; a cell is tight when they are
    equal, and the matching only ever uses tight cells.
    """
    n = len(cost)
    u = [min(row) for row in cost]
    v = [min(cost[i][j] - u[i] for i in range(n)) for j in range(n)]
    row_mate = [-1] * n
    col_mate = [-1] * n

    for root in range(n):
        tree_rows = [root]  # S
        in_tree = [False] * n  # T
        prev = [-1] * n  # the row that reached column j
        free = -1
        while free == -1:
            for i in tree_rows:  # the list grows while we scan it
                for j in range(n):
                    if not in_tree[j] and cost[i][j] - u[i] - v[j] == 0:
                        in_tree[j] = True
                        prev[j] = i
                        if col_mate[j] == -1:
                            free = j
                            break
                        tree_rows.append(col_mate[j])
                if free != -1:
                    break
            if free == -1:  # stuck: make a new tight cell
                delta = min(cost[i][j] - u[i] - v[j]
                            for i in tree_rows for j in range(n) if not in_tree[j])
                for i in tree_rows:
                    u[i] += delta
                for j in range(n):
                    if in_tree[j]:
                        v[j] -= delta
        j = free
        while j != -1:  # flip the augmenting path
            i = prev[j]
            j_next = row_mate[i]
            row_mate[i] = j
            col_mate[j] = i
            j = j_next
    return row_mate


def best_assignment(cost, maximize=False):
    """To maximize, minimize M - cost, where M is the largest entry."""
    if maximize:
        big = max(max(row) for row in cost)
        mate = hungarian([[big - c for c in row] for row in cost])
    else:
        mate = hungarian(cost)
    return sum(cost[i][mate[i]] for i in range(len(cost))), mate
