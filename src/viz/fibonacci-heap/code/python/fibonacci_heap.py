import math

PHI = (1 + math.sqrt(5)) / 2


class Node:
    def __init__(self, key):
        self.key = key
        self.degree = 0
        self.mark = False
        self.parent = None
        self.child = None  # any one child
        self.left = self.right = self  # a circular list of one


def nodes_of(x):
    """The nodes of the circular list that x is in, starting at x."""
    out, y = [], x
    while True:
        out.append(y)
        y = y.right
        if y is x:
            return out


def splice(a, b):
    """Join the circular lists that a and b are in."""
    a_right, b_left = a.right, b.left
    a.right, b.left = b, a
    b_left.right, a_right.left = a_right, b_left


def unlink(x):
    """Take x out of its list; it becomes a list of one."""
    x.left.right, x.right.left = x.right, x.left
    x.left = x.right = x


class FibonacciHeap:
    """A Fibonacci heap (CLRS chapter 19), a min-heap."""

    def __init__(self):
        self.min = None
        self.n = 0

    def __len__(self):
        return self.n

    def _add_root(self, x):
        x.parent, x.mark = None, False
        if self.min is None:
            x.left = x.right = x
            self.min = x
        else:
            splice(self.min.left, x)  # just left of min
            if x.key < self.min.key:
                self.min = x

    def insert(self, key):
        x = Node(key)
        self._add_root(x)
        self.n += 1
        return x

    def minimum(self):
        if self.min is None:
            raise IndexError("heap is empty")
        return self.min.key

    def merge_with(self, other):
        """Move every key of other into this heap; other ends up empty."""
        if other.min is not None:
            if self.min is None:
                self.min = other.min
            else:
                splice(self.min, other.min)
                if other.min.key < self.min.key:
                    self.min = other.min
        self.n += other.n
        other.min, other.n = None, 0

    def extract_min(self):
        z = self.min
        if z is None:
            raise IndexError("heap is empty")
        if z.child is not None:
            for x in nodes_of(z.child):
                x.parent, x.mark = None, False
            splice(z, z.child)
            z.child = None
        if z.right is z:
            self.min = None
        else:
            self.min = z.right
            unlink(z)
            self._consolidate()
        self.n -= 1
        return z.key

    def _consolidate(self):
        table = [None] * (int(math.log(self.n, PHI)) + 2)
        for w in nodes_of(self.min):
            x, d = w, w.degree
            while table[d] is not None:
                y = table[d]
                if x.key > y.key:
                    x, y = y, x
                self._link(y, x)
                table[d] = None
                d += 1
            table[d] = x
        self.min = None
        for x in table:
            if x is not None:
                x.left = x.right = x
                self._add_root(x)

    def _link(self, y, x):
        """Root y becomes a child of root x."""
        unlink(y)
        y.parent, y.mark = x, False
        if x.child is None:
            x.child = y
        else:
            splice(x.child, y)
        x.degree += 1

    def decrease_key(self, x, key):
        if key > x.key:
            raise ValueError("new key is greater than current key")
        x.key = key
        y = x.parent
        if y is not None and x.key < y.key:
            self._cut(x, y)
            self._cascading_cut(y)
        if x.key < self.min.key:
            self.min = x

    def _cut(self, x, y):
        if x.right is x:
            y.child = None
        else:
            if y.child is x:
                y.child = x.right
            unlink(x)
        y.degree -= 1
        self._add_root(x)

    def _cascading_cut(self, y):
        z = y.parent
        while z is not None:
            if not y.mark:
                y.mark = True
                return
            self._cut(y, z)
            y, z = z, z.parent

    def delete(self, x):
        self.decrease_key(x, -math.inf)
        self.extract_min()

    def find(self, key):
        """A node holding key, or None."""

        def search(start):
            if start is None:
                return None
            for x in nodes_of(start):
                if x.key == key:
                    return x
                found = search(x.child)
                if found:
                    return found
            return None

        return search(self.min)

    def clear(self):
        self.min = None
        self.n = 0
