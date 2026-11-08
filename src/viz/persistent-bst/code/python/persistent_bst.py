class Node:
    """Never changed after it is made, so versions can share it."""

    __slots__ = ("key", "left", "right")

    def __init__(self, key, left=None, right=None):
        self.key, self.left, self.right = key, left, right


class PersistentBST:
    """Every update makes a new version by copying one path; old versions stay."""

    def __init__(self):
        self.versions = [None]  # versions[v] is the root of version v
        self.made = 0  # nodes made by the last update

    def search(self, v, k):
        x = self.versions[v]
        while x is not None and k != x.key:
            x = x.left if k < x.key else x.right
        return x is not None

    def _node(self, key, left, right):
        self.made += 1
        return Node(key, left, right)

    def insert(self, v, k):
        """Insert k into version v. Returns the new version's number, or None."""
        if self.search(v, k):
            return None
        self.made = 0
        self.versions.append(self._insert(self.versions[v], k))
        return len(self.versions) - 1

    def _insert(self, x, k):
        if x is None:
            return self._node(k, None, None)
        if k < x.key:  # copy x, pointing at the new left subtree
            return self._node(x.key, self._insert(x.left, k), x.right)
        return self._node(x.key, x.left, self._insert(x.right, k))

    def delete(self, v, k):
        """Delete k from version v. Returns the new version's number, or None."""
        if not self.search(v, k):
            return None
        self.made = 0
        self.versions.append(self._delete(self.versions[v], k))
        return len(self.versions) - 1

    def _delete(self, x, k):
        if k < x.key:
            return self._node(x.key, self._delete(x.left, k), x.right)
        if k > x.key:
            return self._node(x.key, x.left, self._delete(x.right, k))
        if x.left is None:
            return x.right  # shared as it is
        if x.right is None:
            return x.left
        y = x.right
        while y.left is not None:
            y = y.left
        # A copy of the successor takes x's place; copy the path down to it.
        return self._node(y.key, x.left, self._without_min(x.right))

    def _without_min(self, x):
        if x.left is None:
            return x.right
        return self._node(x.key, self._without_min(x.left), x.right)
