class Node:
    def __init__(self, key, parent=None):
        self.key = key
        self.left = None
        self.right = None
        self.parent = parent


class SplayTree:
    """A bottom-up splay tree of distinct keys: every access moves its key to the root."""

    def __init__(self):
        self.root = None
        self.size = 0
        self.rotations = 0

    def _rotate_up(self, x):
        """Rotate at x's parent so that x moves up one level."""
        p, g = x.parent, x.parent.parent
        if x is p.left:
            p.left = x.right
            if x.right is not None:
                x.right.parent = p
            x.right = p
        else:
            p.right = x.left
            if x.left is not None:
                x.left.parent = p
            x.left = p
        p.parent = x
        x.parent = g
        if g is None:
            self.root = x
        elif g.left is p:
            g.left = x
        else:
            g.right = x
        self.rotations += 1

    def _splay(self, x, stop=None):
        """Move x up until its parent is stop (None: until x is the root)."""
        while x.parent is not stop:
            p = x.parent
            g = p.parent
            if g is stop:  # zig
                self._rotate_up(x)
            elif (x is p.left) == (p is g.left):  # zig-zig: grandparent first
                self._rotate_up(p)
                self._rotate_up(x)
            else:  # zig-zag: parent first
                self._rotate_up(x)
                self._rotate_up(x)

    def _find(self, k):
        """The node with key k, or the last node on the way down (None if empty)."""
        x, last = self.root, None
        while x is not None:
            last = x
            if k == x.key:
                break
            x = x.left if k < x.key else x.right
        return last

    def search(self, k):
        x = self._find(k)
        if x is not None:
            self._splay(x)  # even on a miss: the last node visited
        return x is not None and x.key == k

    def insert(self, k):
        y = self._find(k)
        if y is not None and y.key == k:
            self._splay(y)
            return False
        z = Node(k, y)
        if y is None:
            self.root = z
        elif k < y.key:
            y.left = z
        else:
            y.right = z
        self.size += 1
        self._splay(z)
        return True

    def delete(self, k):
        if not self.search(k):  # splays k to the root if it is there
            return False
        z = self.root
        if z.left is None:
            self.root = z.right
        else:
            m = z.left
            while m.right is not None:
                m = m.right
            self._splay(m, z)  # now m is z's left child, with no right child
            m.right = z.right
            if z.right is not None:
                z.right.parent = m
            self.root = m
        if self.root is not None:
            self.root.parent = None
        self.size -= 1
        return True

    def minimum(self):
        x = self.root
        while x.left is not None:
            x = x.left
        self._splay(x)
        return x

    def maximum(self):
        x = self.root
        while x.right is not None:
            x = x.right
        self._splay(x)
        return x

    def height(self, x):
        return -1 if x is None else 1 + max(self.height(x.left), self.height(x.right))

    def inorder(self, x, out):
        if x is not None:
            self.inorder(x.left, out)
            out.append(x.key)
            self.inorder(x.right, out)
