FAR = 10000  # the super triangle's corners: far enough to act like points at infinity


def in_circle(a, b, c, d):
    """Positive if d is inside the circle through a, b, c (counter-clockwise). Exact."""
    adx, ady = a[0] - d[0], a[1] - d[1]
    bdx, bdy = b[0] - d[0], b[1] - d[1]
    cdx, cdy = c[0] - d[0], c[1] - d[1]
    return (
        (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy)
        - (bdx * bdx + bdy * bdy) * (adx * cdy - cdx * ady)
        + (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady)
    )


def bowyer_watson(points):
    """Delaunay triangles of distinct points, as triples of points."""
    pts = [(-FAR, -FAR), (FAR, -FAR), (0, FAR)] + list(points)
    tris = [(0, 1, 2)]  # vertex indices, counter-clockwise
    for k in range(3, len(pts)):
        p = pts[k]
        bad = [t for t in tris if in_circle(pts[t[0]], pts[t[1]], pts[t[2]], p) > 0]
        edges = [(t[i], t[(i + 1) % 3]) for t in bad for i in range(3)]
        edge_set = set(edges)
        hole = [(u, w) for u, w in edges if (w, u) not in edge_set]  # unshared edges
        tris = [t for t in tris if t not in bad] + [(u, w, k) for u, w in hole]
    return [tuple(pts[i] for i in t) for t in tris if min(t) >= 3]
