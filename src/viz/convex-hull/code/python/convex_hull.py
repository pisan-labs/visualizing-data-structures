from functools import cmp_to_key


def turn(a, b, c):
    """Positive if a -> b -> c turns left, negative if right, 0 if collinear."""
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def graham_scan(points):
    """Corners of the convex hull, counter-clockwise from the lowest point."""
    pts = list(dict.fromkeys(points))  # drop duplicates
    if not pts:
        return []
    p0 = min(pts, key=lambda p: (p[1], p[0]))

    def by_angle(a, b):
        t = turn(p0, a, b)
        return -t if t != 0 else dist2(p0, a) - dist2(p0, b)

    rest = sorted((p for p in pts if p != p0), key=cmp_to_key(by_angle))
    stack = []
    for p in [p0] + rest:
        # Pop every point that does not make a left turn on the way to p.
        while len(stack) >= 2 and turn(stack[-2], stack[-1], p) <= 0:
            stack.pop()
        stack.append(p)
    return stack
