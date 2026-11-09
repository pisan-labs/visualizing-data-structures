import random


def karger(n, edges, randint=random.randint):
    """One trial of Karger's algorithm on vertices 0..n-1 and a list of edges (u, v).

    Contract a random edge until two super-vertices are left. randint(lo, hi) returns a random
    int in [lo, hi]. Returns the edges of the cut and each vertex's super-vertex (its smallest
    member).
    """
    group = list(range(n))
    count = n
    while count > 2:
        left = [(u, v) for u, v in edges if group[u] != group[v]]  # self-loops are gone
        if not left:  # not connected: the cut is empty
            break
        u, v = left[randint(0, len(left) - 1)]
        keep, gone = min(group[u], group[v]), max(group[u], group[v])
        group = [keep if g == gone else g for g in group]
        count -= 1
    cut = [(u, v) for u, v in edges if group[u] != group[v]]
    return cut, group


def min_cut(n, edges, trials):
    """Repeat Karger's trial and keep the smallest cut found."""
    return min((karger(n, edges)[0] for _ in range(trials)), key=len)
