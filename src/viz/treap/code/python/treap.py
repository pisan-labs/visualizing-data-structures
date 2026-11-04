import random


class Node:
    def __init__(self, key, priority):
        self.key = key
        self.priority = priority
        self.left = None
        self.right = None


class Treap:
    """A BST by keys and a heap by priorities: smaller priorities sit higher."""

    def __init__(self):
        self.root = None
        self.size = 0
        self.rotations = 0

    def search(self, k):
        x = self.root
        while x is not None and k != x.key:
            x = x.left if k < x.key else x.right
        return x

    def insert(self, k, priority=None):
        if self.search(k) is not None:
            return False
        if priority is None:
            priority = random.randint(1, 99)
        self.root = self._insert(self.root, k, priority)
        self.size += 1
        return True

    def _insert(self, x, k, priority):
        if x is None:
            return Node(k, priority)
        if k < x.key:
            x.left = self._insert(x.left, k, priority)
            if x.left.priority < x.priority:  # heap order broken: lift the child
                x = self._rotate_right(x)
        else:
            x.right = self._insert(x.right, k, priority)
            if x.right.priority < x.priority:
                x = self._rotate_left(x)
        return x

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
        elif x.left.priority < x.right.priority:  # rotate x down, below that child
            x = self._rotate_right(x)
            x.right = self._delete(x.right, k)
        else:
            x = self._rotate_left(x)
            x.left = self._delete(x.left, k)
        return x

    def _rotate_right(self, x):
        y = x.left
        x.left = y.right
        y.right = x
        self.rotations += 1
        return y

    def _rotate_left(self, x):
        y = x.right
        x.right = y.left
        y.left = x
        self.rotations += 1
        return y

    def minimum(self):
        x = self.root
        while x.left is not None:
            x = x.left
        return x

    def maximum(self):
        x = self.root
        while x.right is not None:
            x = x.right
        return x

    def height(self, x):
        return -1 if x is None else 1 + max(self.height(x.left), self.height(x.right))

    def inorder(self, x, out):
        if x is not None:
            self.inorder(x.left, out)
            out.append(x.key)
            self.inorder(x.right, out)
