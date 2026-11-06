import math

# 3x3 matrices act on column vectors (x, y, z): p' = M p.


def multiply(a, b):
    """The product a b: apply b first, then a."""
    return [[a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j] for j in range(3)]
            for i in range(3)]


def rotation(axis, degrees):
    """Counter-clockwise about the axis, seen with the axis pointing at you."""
    theta = degrees * math.pi / 180
    c, s = math.cos(theta), math.sin(theta)
    if axis == "x":
        return [[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]]
    if axis == "y":
        return [[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]]
    return [[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]]


def scaling(sx, sy, sz):
    return [[sx, 0.0, 0.0], [0.0, sy, 0.0], [0.0, 0.0, sz]]


def apply(m, p):
    x, y, z = p
    return tuple(m[i][0] * x + m[i][1] * y + m[i][2] * z for i in range(3))
