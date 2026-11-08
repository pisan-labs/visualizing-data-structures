class Node:
    def __init__(self, point, depth):
        self.point = point  # (x, y)
        self.depth = depth  # split on x at even depths, on y at odd ones
        self.left = None
        self.right = None


def dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


class KdTree:
    def __init__(self):
        self.root = None

    def insert(self, p):
        if self.root is None:
            self.root = Node(p, 0)
            return
        x = self.root
        while x.point != p:  # a point already in the tree is skipped
            a = x.depth % 2
            if p[a] < x.point[a]:
                if x.left is None:
                    x.left = Node(p, x.depth + 1)
                    return
                x = x.left
            else:
                if x.right is None:
                    x.right = Node(p, x.depth + 1)
                    return
                x = x.right

    def nearest(self, q):
        """The point nearest q and its squared distance, or None if the tree is empty."""
        best = [None, float("inf")]

        def search(x):
            if x is None:
                return
            d = dist2(q, x.point)
            if d < best[1]:
                best[0], best[1] = x.point, d
            a = x.depth % 2
            diff = q[a] - x.point[a]
            near, far = (x.left, x.right) if diff < 0 else (x.right, x.left)
            search(near)
            if diff * diff < best[1]:  # the best circle crosses the line
                search(far)

        search(self.root)
        return None if best[0] is None else (best[0], best[1])

    def range(self, lo, hi):
        """Every point p with lo <= p <= hi on both coordinates."""
        out = []

        def search(x):
            if x is None:
                return
            p = x.point
            if lo[0] <= p[0] <= hi[0] and lo[1] <= p[1] <= hi[1]:
                out.append(p)
            a = x.depth % 2
            if lo[a] < p[a]:
                search(x.left)
            if hi[a] >= p[a]:
                search(x.right)

        search(self.root)
        return out
