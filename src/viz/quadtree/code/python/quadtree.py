class Node:
    def __init__(self, x0, y0, size, depth):
        self.x0, self.y0, self.size, self.depth = x0, y0, size, depth
        self.points = []  # a leaf's points
        self.kids = None  # NW, NE, SW, SE once split

    def quadrant(self, p):
        h = self.size // 2
        east = p[0] >= self.x0 + h
        north = p[1] >= self.y0 + h
        return (0 if north else 2) + (1 if east else 0)

    def split(self):
        h = self.size // 2
        corners = [(0, h), (h, h), (0, 0), (h, 0)]
        self.kids = [Node(self.x0 + dx, self.y0 + dy, h, self.depth + 1) for dx, dy in corners]
        for p in self.points:
            self.kids[self.quadrant(p)].points.append(p)
        self.points = None


class QuadTree:
    """A point-region quadtree over [0, side) x [0, side); a leaf holds up to `capacity` points."""

    def __init__(self, capacity=1, side=16):
        self.capacity = capacity
        self.root = Node(0, 0, side, 0)
        self.all = set()

    def insert(self, p):
        if p in self.all:
            return
        self.all.add(p)
        x = self.root
        while x.kids:
            x = x.kids[x.quadrant(p)]
        x.points.append(p)
        while len(x.points) > self.capacity and x.size > 1:
            x.split()
            x = x.kids[x.quadrant(p)]

    def query(self, lo, hi):
        """Every point with lo <= p <= hi on both coordinates."""
        out = []

        def visit(x):
            if not (lo[0] < x.x0 + x.size and hi[0] >= x.x0 and lo[1] < x.y0 + x.size and hi[1] >= x.y0):
                return  # the square misses the rectangle
            if x.kids:
                for k in x.kids:
                    visit(k)
            else:
                out.extend(p for p in x.points if lo[0] <= p[0] <= hi[0] and lo[1] <= p[1] <= hi[1])

        visit(self.root)
        return out

    def stats(self):
        """(number of nodes, height)."""

        def walk(x):
            if not x.kids:
                return 1, x.depth
            parts = [walk(k) for k in x.kids]
            return 1 + sum(n for n, _ in parts), max(h for _, h in parts)

        return walk(self.root)
