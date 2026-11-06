import math

# A rigid motion is a 3x3 matrix acting on (x, y, 1): [[cos, -sin, tx], [sin, cos, ty], [0, 0, 1]].


def multiply(a, b):
    """The product a b: apply b first, then a."""
    return [[a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j] for j in range(3)]
            for i in range(3)]


def rotation(degrees):
    """Counter-clockwise about the origin."""
    theta = degrees * math.pi / 180
    c, s = math.cos(theta), math.sin(theta)
    return [[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]]


def translation(tx, ty):
    return [[1.0, 0.0, tx], [0.0, 1.0, ty], [0.0, 0.0, 1.0]]


def rotation_about(degrees, cx, cy):
    """Slide c to the origin, rotate, slide back: T(c) R T(-c)."""
    return multiply(translation(cx, cy), multiply(rotation(degrees), translation(-cx, -cy)))


def inverse(m):
    """Undo p' = R p + t with p = R^T p' - R^T t. No division needed."""
    tx, ty = m[0][2], m[1][2]
    return [[m[0][0], m[1][0], -(m[0][0] * tx + m[1][0] * ty)],
            [m[0][1], m[1][1], -(m[0][1] * tx + m[1][1] * ty)],
            [0.0, 0.0, 1.0]]


def apply(m, point):
    x, y = point
    return (m[0][0] * x + m[0][1] * y + m[0][2], m[1][0] * x + m[1][1] * y + m[1][2])
