class Node:
    def __init__(self, lo, hi, parent=None):
        self.lo, self.hi = lo, hi
        self.max = hi  # largest high end in this subtree
        self.left = self.right = None
        self.parent = parent


def overlaps(a_lo, a_hi, b_lo, b_hi):
    return a_lo <= b_hi and b_lo <= a_hi


class IntervalTree:
    """A BST keyed on (low, high), each node knowing the largest high end below it."""

    def __init__(self):
        self.root = None
        self.size = 0

    def find(self, lo, hi):
        x = self.root
        while x is not None and (lo, hi) != (x.lo, x.hi):
            x = x.left if (lo, hi) < (x.lo, x.hi) else x.right
        return x

    def insert(self, lo, hi):
        if self.find(lo, hi) is not None:
            return False
        parent, x = None, self.root
        while x is not None:
            x.max = max(x.max, hi)  # the new interval will be below x
            parent, x = x, (x.left if (lo, hi) < (x.lo, x.hi) else x.right)
        z = Node(lo, hi, parent)
        if parent is None:
            self.root = z
        elif (lo, hi) < (parent.lo, parent.hi):
            parent.left = z
        else:
            parent.right = z
        self.size += 1
        return True

    def delete(self, lo, hi):
        z = self.find(lo, hi)
        if z is None:
            return False
        if z.left is None or z.right is None:
            start = z.parent
            self._transplant(z, z.left or z.right)
        else:
            y = z.right
            while y.left is not None:
                y = y.left
            if y is not z.right:
                start = y.parent
                self._transplant(y, y.right)
                y.right = z.right
                y.right.parent = y
            else:
                start = y
            self._transplant(z, y)
            y.left = z.left
            y.left.parent = y
        while start is not None:  # fix max from the lowest change up
            start.max = max(start.hi, self._max(start.left), self._max(start.right))
            start = start.parent
        self.size -= 1
        return True

    @staticmethod
    def _max(x):
        return -1 if x is None else x.max

    def _transplant(self, u, v):
        if u.parent is None:
            self.root = v
        elif u is u.parent.left:
            u.parent.left = v
        else:
            u.parent.right = v
        if v is not None:
            v.parent = u.parent

    def overlap(self, lo, hi):
        """CLRS INTERVAL-SEARCH: one interval overlapping [lo, hi], or None."""
        x, visited = self.root, 0
        while x is not None:
            visited += 1
            if overlaps(lo, hi, x.lo, x.hi):
                break
            if x.left is not None and x.left.max >= lo:
                x = x.left
            else:
                x = x.right
        return x, visited

    def all(self, lo, hi):
        """Every interval overlapping [lo, hi], skipping subtrees that cannot hold one."""
        found, visited = [], [0]

        def visit(x):
            visited[0] += 1
            if overlaps(lo, hi, x.lo, x.hi):
                found.append(x)
            if x.left is not None and x.left.max >= lo:
                visit(x.left)
            if x.right is not None and x.lo <= hi:
                visit(x.right)

        if self.root is not None:
            visit(self.root)
        return found, visited[0]

    def height(self, x):
        return -1 if x is None else 1 + max(self.height(x.left), self.height(x.right))
