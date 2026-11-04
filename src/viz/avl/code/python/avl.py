class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None
        self.height = 0  # a leaf has height 0


def height(x):
    return -1 if x is None else x.height


def balance(x):
    """Left height minus right height: -1, 0 or +1 in an AVL tree."""
    return height(x.left) - height(x.right)


def update(x):
    x.height = 1 + max(height(x.left), height(x.right))


class AVLTree:
    """A binary search tree of distinct keys that rotates to stay balanced."""

    def __init__(self):
        self.root = None
        self.size = 0
        self.rotations = 0  # single rotations so far; a double rotation counts 2

    def search(self, k):
        x = self.root
        while x is not None and k != x.key:
            x = x.left if k < x.key else x.right
        return x

    def insert(self, k):
        if self.search(k) is not None:
            return False
        self.root = self._insert(self.root, k)
        self.size += 1
        return True

    def _insert(self, x, k):
        if x is None:
            return Node(k)
        if k < x.key:
            x.left = self._insert(x.left, k)
        else:
            x.right = self._insert(x.right, k)
        return self._rebalance(x)

    def delete(self, k):
        if self.search(k) is None:
            return False
        self.root = self._delete(self.root, k)
        self.size -= 1
        return True

    def _delete(self, x, k):
        if k < x.key:
            x.left = self._delete(x.left, k)
        elif k > x.key:
            x.right = self._delete(x.right, k)
        elif x.left is None:
            return x.right
        elif x.right is None:
            return x.left
        else:
            y = self.minimum(x.right)  # the successor takes x's place
            x.key = y.key
            x.right = self._delete(x.right, y.key)
        return self._rebalance(x)

    def _rebalance(self, x):
        """Fix x's height; if x is out of balance, rotate. Returns the subtree's new root."""
        update(x)
        if balance(x) == 2:  # too tall on the left
            if balance(x.left) < 0:  # LR: turn it into LL first
                x.left = self._rotate_left(x.left)
            return self._rotate_right(x)  # LL
        if balance(x) == -2:  # too tall on the right
            if balance(x.right) > 0:  # RL: turn it into RR first
                x.right = self._rotate_right(x.right)
            return self._rotate_left(x)  # RR
        return x

    def _rotate_right(self, x):
        y = x.left
        x.left = y.right  # y's right subtree moves across
        y.right = x
        update(x)  # x is now below y, so fix it first
        update(y)
        self.rotations += 1
        return y

    def _rotate_left(self, x):
        y = x.right
        x.right = y.left
        y.left = x
        update(x)
        update(y)
        self.rotations += 1
        return y

    def minimum(self, x):
        while x.left is not None:
            x = x.left
        return x

    def maximum(self, x):
        while x.right is not None:
            x = x.right
        return x

    def inorder(self, x, out):
        if x is not None:
            self.inorder(x.left, out)
            out.append(x.key)
            self.inorder(x.right, out)
