def turn(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(r, a, b):
    return min(a[0], b[0]) <= r[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= r[1] <= max(a[1], b[1])


def intersects(s, t):
    """CLRS SEGMENTS-INTERSECT: do segments s and t share a point?"""
    (p1, p2), (p3, p4) = s, t
    d1, d2 = turn(p3, p4, p1), turn(p3, p4, p2)
    d3, d4 = turn(p1, p2, p3), turn(p1, p2, p4)
    if d1 * d2 < 0 and d3 * d4 < 0:
        return True
    return (
        (d1 == 0 and on_segment(p1, p3, p4))
        or (d2 == 0 and on_segment(p2, p3, p4))
        or (d3 == 0 and on_segment(p3, p1, p2))
        or (d4 == 0 and on_segment(p4, p1, p2))
    )


def below(s, t, x):
    """Is s below t on the sweep line at x (ties: the smaller slope, lower just to the right)?"""
    (a, b), (c, d) = s, t
    # y_s(x) = a.y + (x - a.x) * dy_s / dx_s; compare the fractions without dividing.
    ys = a[1] * (b[0] - a[0]) + (x - a[0]) * (b[1] - a[1])
    yt = c[1] * (d[0] - c[0]) + (x - c[0]) * (d[1] - c[1])
    lhs, rhs = ys * (d[0] - c[0]), yt * (b[0] - a[0])
    if lhs != rhs:
        return lhs < rhs
    return (b[1] - a[1]) * (d[0] - c[0]) < (d[1] - c[1]) * (b[0] - a[0])


def any_segments_intersect(segments):
    """segments: ((x1, y1), (x2, y2)) with x1 < x2 (no vertical segments)."""
    events = []
    for i, (p, q) in enumerate(segments):
        events.append((p[0], 0, p[1], i))  # left end points first at equal x
        events.append((q[0], 1, q[1], i))
    events.sort()
    status = []  # segment indices, bottom to top
    for x, kind, _, i in events:
        s = segments[i]
        if kind == 0:
            k = 0
            while k < len(status) and below(segments[status[k]], s, x):
                k += 1
            status.insert(k, i)
            for j in (k - 1, k + 1):
                if 0 <= j < len(status) and intersects(s, segments[status[j]]):
                    return True
        else:
            k = status.index(i)
            if 0 < k < len(status) - 1 and intersects(segments[status[k - 1]], segments[status[k + 1]]):
                return True
            status.pop(k)
    return False
