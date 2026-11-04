class Node:
    def __init__(self, key, parent=None):
        self.key = key
        self.left = None
        self.right = None
        self.parent = parent
        self.size = 1  # keys in this subtree, for select and rank


def size(x):
    return 0 if x is None else x.size


class BST:
    """A binary search tree with parent pointers. Duplicate keys are rejected."""

    def __init__(self):
        self.root = None

    def search(self, k):
        x = self.root
        while x is not None and k != x.key:
            x = x.left if k < x.key else x.right
        return x

    def insert(self, k):
        y, x = None, self.root
        while x is not None:
            y = x
            if k == x.key:
                return False
            x = x.left if k < x.key else x.right
        z = Node(k, y)
        if y is None:
            self.root = z
        elif k < y.key:
            y.left = z
        else:
            y.right = z
        self._fix_sizes(y)
        return True

    def delete(self, k):
        z = self.search(k)
        if z is None:
            return False
        if z.left is None:
            fix = z.parent
            self._transplant(z, z.right)
        elif z.right is None:
            fix = z.parent
            self._transplant(z, z.left)
        else:
            y = self.minimum(z.right)  # the successor
            fix = y if y.parent is z else y.parent
            if y is not z.right:
                self._transplant(y, y.right)
                y.right = z.right
                y.right.parent = y
            self._transplant(z, y)
            y.left = z.left
            y.left.parent = y
        self._fix_sizes(fix)
        return True

    def _transplant(self, u, v):
        """Put the subtree rooted at v where the subtree rooted at u was."""
        if u.parent is None:
            self.root = v
        elif u is u.parent.left:
            u.parent.left = v
        else:
            u.parent.right = v
        if v is not None:
            v.parent = u.parent

    def _fix_sizes(self, x):
        while x is not None:
            x.size = 1 + size(x.left) + size(x.right)
            x = x.parent

    def minimum(self, x):
        while x.left is not None:
            x = x.left
        return x

    def maximum(self, x):
        while x.right is not None:
            x = x.right
        return x

    def successor(self, x):
        if x.right is not None:
            return self.minimum(x.right)
        y = x.parent
        while y is not None and x is y.right:
            x, y = y, y.parent
        return y

    def predecessor(self, x):
        if x.left is not None:
            return self.maximum(x.left)
        y = x.parent
        while y is not None and x is y.left:
            x, y = y, y.parent
        return y

    def select(self, i):
        """The i-th smallest key (1 is the smallest), or None."""
        x = self.root
        while x is not None:
            r = size(x.left) + 1
            if i == r:
                return x
            if i < r:
                x = x.left
            else:
                i -= r
                x = x.right
        return None

    def rank(self, k):
        """The place of k in sorted order (1 is the smallest), or None."""
        r, x = 0, self.root
        while x is not None:
            if k < x.key:
                x = x.left
            elif k > x.key:
                r += size(x.left) + 1
                x = x.right
            else:
                return r + size(x.left) + 1
        return None

    def lower_bound(self, k):
        """The smallest key >= k, or None."""
        best, x = None, self.root
        while x is not None:
            if x.key >= k:
                best, x = x, x.left
            else:
                x = x.right
        return best

    def inorder(self, x, out):
        if x is not None:
            self.inorder(x.left, out)
            out.append(x.key)
            self.inorder(x.right, out)

    def height(self, x):
        return -1 if x is None else 1 + max(self.height(x.left), self.height(x.right))
