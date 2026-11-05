import math


def rotate(points, degrees, pivot=(0.0, 0.0)):
    """Rotate points counter-clockwise by degrees about pivot: p' = c + R (p - c)."""
    theta = degrees * math.pi / 180
    cos, sin = math.cos(theta), math.sin(theta)
    cx, cy = pivot
    out = []
    for x, y in points:
        dx, dy = x - cx, y - cy
        out.append((cx + (cos * dx - sin * dy), cy + (sin * dx + cos * dy)))
    return out


def scale(points, sx, sy, pivot=(0.0, 0.0)):
    """Scale points by sx in x and sy in y about pivot: p' = c + S (p - c)."""
    cx, cy = pivot
    return [(cx + sx * (x - cx), cy + sy * (y - cy)) for x, y in points]
