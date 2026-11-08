def dist2(p, q):
    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2


def closest_pair(points):
    """The smallest squared distance between two of the points (at least two)."""
    xs = sorted(range(len(points)), key=lambda i: (points[i][0], points[i][1], i))
    ys = sorted(range(len(points)), key=lambda i: (points[i][1], points[i][0], i))
    return _closest([points[i] for i in xs], [points[i] for i in ys], xs, ys)


def _closest(px, py, ix, iy):
    n = len(px)
    if n <= 3:  # brute force the base case
        return min(dist2(px[i], px[j]) for i in range(n) for j in range(i + 1, n))
    mid = n // 2
    xm = px[mid][0]  # the dividing line x = xm
    left = set(ix[:mid])
    yl = [k for k in range(n) if iy[k] in left]
    yr = [k for k in range(n) if iy[k] not in left]
    d = min(
        _closest(px[:mid], [py[k] for k in yl], ix[:mid], [iy[k] for k in yl]),
        _closest(px[mid:], [py[k] for k in yr], ix[mid:], [iy[k] for k in yr]),
    )
    strip = [p for p in py if (p[0] - xm) ** 2 < d]  # within delta of the line, by y
    for i, p in enumerate(strip):
        for q in strip[i + 1 :]:
            if (q[1] - p[1]) ** 2 >= d:
                break  # at most 7 points get this far
            d = min(d, dist2(p, q))
    return d
