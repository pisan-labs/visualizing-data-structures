class Frame:
    """A 2D frame: an origin o and axes u, v, all in world coordinates."""

    def __init__(self, o, u, v):
        self.o, self.u, self.v = o, u, v
        self.det = u[0] * v[1] - v[0] * u[1]
        if self.det == 0:
            raise ValueError("the axes are parallel")

    def to_world(self, q):
        """World point of the frame coordinates q = (a, b): o + a*u + b*v."""
        (ox, oy), (ux, uy), (vx, vy) = self.o, self.u, self.v
        a, b = q
        return (ox + a * ux + b * vx, oy + a * uy + b * vy)

    def to_local(self, p):
        """Frame coordinates of the world point p: M^-1 (p - o), by Cramer's rule."""
        (ux, uy), (vx, vy) = self.u, self.v
        dx, dy = p[0] - self.o[0], p[1] - self.o[1]
        return ((dx * vy - vx * dy) / self.det, (ux * dy - dx * uy) / self.det)
