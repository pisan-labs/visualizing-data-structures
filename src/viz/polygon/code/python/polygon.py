import math


def turn(a, b, c):
    """Positive if a -> b -> c turns left, negative if right, 0 if collinear."""
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def area2(poly):
    """Twice the signed area (shoelace): positive when counter-clockwise."""
    n = len(poly)
    return sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1]
               for i in range(n))


def orientation(poly):
    """'ccw', 'cw' or 'degenerate', from the turn at the lowest vertex."""
    n = len(poly)
    k = min(range(n), key=lambda i: (poly[i][1], poly[i][0]))
    t = turn(poly[k - 1], poly[k], poly[(k + 1) % n])
    return "ccw" if t > 0 else "cw" if t < 0 else "degenerate"


def is_convex(poly):
    """Every turn goes the same way, and the turns add up to one full circle."""
    n = len(poly)
    sign, total = 0, 0.0
    for i in range(n):
        a, b, c = poly[i - 1], poly[i], poly[(i + 1) % n]
        t = turn(a, b, c)
        d = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])
        if (t > 0 and sign < 0) or (t < 0 and sign > 0) or (t == 0 and d < 0):
            return False
        if sign == 0 and t != 0:
            sign = 1 if t > 0 else -1
        total += math.atan2(t, d)
    return round(abs(total) / (2 * math.pi)) == 1


def on_segment(a, b, q):
    return (turn(a, b, q) == 0 and min(a[0], b[0]) <= q[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= q[1] <= max(a[1], b[1]))


def ray_cast(poly, q):
    """'inside', 'outside' or 'boundary', by counting crossings of a ray to the right."""
    n = len(poly)
    inside = False
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if on_segment(a, b, q):
            return "boundary"
        if (a[1] > q[1]) != (b[1] > q[1]):
            x = a[0] + (q[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if q[0] < x:
                inside = not inside
    return "inside" if inside else "outside"


def winding_number(poly, q):
    """'inside', 'outside' or 'boundary', by the nonzero winding rule."""
    n = len(poly)
    w = 0
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if on_segment(a, b, q):
            return "boundary"
        if a[1] <= q[1] < b[1] and turn(a, b, q) > 0:
            w += 1
        elif b[1] <= q[1] < a[1] and turn(a, b, q) < 0:
            w -= 1
    return "inside" if w != 0 else "outside"
