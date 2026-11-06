def approx_vertex_cover(edges):
    """CLRS's APPROX-VERTEX-COVER. edges lists (u, v) pairs of an undirected graph.

    Take an edge with neither end in the cover and add both ends. The edges taken share no
    vertex, and any cover needs one end of each, so the cover is at most twice the smallest.
    """
    cover, taken = [], set()
    for u, v in edges:
        if u not in taken and v not in taken:
            cover += [u, v]
            taken |= {u, v}
    return cover


def min_cover_size(n, edges):
    """Brute force over all 2^n sets of vertices 0..n-1: the size of a smallest cover."""
    best = n
    for mask in range(1 << n):
        k = bin(mask).count("1")
        if k < best and all(mask >> u & 1 or mask >> v & 1 for u, v in edges):
            best = k
    return best
