class Node:
    def __init__(self, key, parent=None):
        self.key = key
        self.left = None
        self.right = None
        self.parent = parent


def size(x):
    return 0 if x is None else 1 + size(x.left) + size(x.right)


class ScapegoatTree:
    """A BST that never rotates. alpha = 2/3: no node deeper than log base 3/2 of n."""

    def __init__(self):
        self.root = None
        self.n = 0
        self.max_n = 0  # largest n since the last full rebuild
        self.rebuilds = 0

    def search(self, k):
        x = self.root
        while x is not None and k != x.key:
            x = x.left if k < x.key else x.right
        return x

    def insert(self, k):
        parent, x, depth = None, self.root, 0
        while x is not None:
            if k == x.key:
                return False
            parent, x = x, (x.left if k < x.key else x.right)
            depth += 1
        z = Node(k, parent)
        if parent is None:
            self.root = z
        elif k < parent.key:
            parent.left = z
        else:
            parent.right = z
        self.n += 1
        self.max_n = max(self.max_n, self.n)
        if 1.5**depth > self.n:  # too deep: find the scapegoat on the way up
            child, w, child_size = z, parent, 1
            while True:
                w_size = child_size + 1 + size(w.right if w.left is child else w.left)
                if 3 * child_size > 2 * w_size:  # child holds more than 2/3
                    break
                child, w, child_size = w, w.parent, w_size
            self._rebuild(w)
        return True

    def delete(self, k):
        z = self.search(k)
        if z is None:
            return False
        if z.left is None:
            self._transplant(z, z.right)
        elif z.right is None:
            self._transplant(z, z.left)
        else:
            y = z.right
            while y.left is not None:
                y = y.left
            if y is not z.right:
                self._transplant(y, y.right)
                y.right = z.right
                y.right.parent = y
            self._transplant(z, y)
            y.left = z.left
            y.left.parent = y
        self.n -= 1
        if 3 * self.n < 2 * self.max_n:  # too many deletes: rebuild everything
            if self.root is not None:
                self._rebuild(self.root)
            self.max_n = self.n
        return True

    def _transplant(self, u, v):
        if u.parent is None:
            self.root = v
        elif u is u.parent.left:
            u.parent.left = v
        else:
            u.parent.right = v
        if v is not None:
            v.parent = u.parent

    def _rebuild(self, w):
        parent = w.parent
        nodes = []
        self._flatten(w, nodes)
        top = self._build(nodes, 0, len(nodes) - 1, parent)
        if parent is None:
            self.root = top
        elif parent.left is w:
            parent.left = top
        else:
            parent.right = top
        self.rebuilds += 1

    def _flatten(self, x, out):
        if x is not None:
            self._flatten(x.left, out)
            out.append(x)
            self._flatten(x.right, out)

    def _build(self, nodes, lo, hi, parent):
        if lo > hi:
            return None
        mid = (lo + hi) // 2
        x = nodes[mid]
        x.parent = parent
        x.left = self._build(nodes, lo, mid - 1, x)
        x.right = self._build(nodes, mid + 1, hi, x)
        return x

    def height(self, x):
        return -1 if x is None else 1 + max(self.height(x.left), self.height(x.right))
