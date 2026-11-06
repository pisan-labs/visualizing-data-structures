# A frame is an origin o and three axes u, v, w, all in world coordinates.


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def to_world(o, u, v, w, q):
    """The world point with frame coordinates q = (a, b, c): o + a u + b v + c w."""
    a, b, c = q
    return tuple(o[i] + a * u[i] + b * v[i] + c * w[i] for i in range(3))


def to_local(o, u, v, w, p):
    """p in the frame's coordinates: M^-1 (p - o), with M^-1 built from cross products."""
    det = dot(u, cross(v, w))
    if abs(det) < 1e-9:
        raise ValueError("the axes lie in one plane: not a frame")
    d = sub(p, o)
    return (dot(d, cross(v, w)) / det, dot(d, cross(w, u)) / det, dot(d, cross(u, v)) / det)


def to_local_orthonormal(o, u, v, w, p):
    """The shortcut for perpendicular unit axes: M^-1 = M^T, so three dot products."""
    d = sub(p, o)
    return (dot(u, d), dot(v, d), dot(w, d))
