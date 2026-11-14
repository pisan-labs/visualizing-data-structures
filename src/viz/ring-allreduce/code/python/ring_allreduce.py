def reduce_scatter(v):
    """v[i] is worker i's vector, cut into n chunks (one number each here).

    In step t every worker i sends chunk (i - t) mod n to worker i + 1, which
    adds it to its own. All sends in a step happen at once. Afterwards worker
    i holds the whole sum of chunk (i + 1) mod n.
    """
    n = len(v)
    for t in range(n - 1):
        sent = [(i, (i - t) % n, v[i][(i - t) % n]) for i in range(n)]
        for i, c, value in sent:
            v[(i + 1) % n][c] += value


def all_gather(v):
    """After reduce_scatter: pass each finished chunk once round the ring."""
    n = len(v)
    for t in range(n - 1):
        sent = [(i, (i + 1 - t) % n, v[i][(i + 1 - t) % n]) for i in range(n)]
        for i, c, value in sent:
            v[(i + 1) % n][c] = value


def ring_all_reduce(v):
    """Every worker ends with the sum of all the vectors.

    Each worker sends 2 (n - 1) chunks: 2 (n - 1) / n of one vector.
    """
    reduce_scatter(v)
    all_gather(v)
