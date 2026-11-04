class Node:
    def __init__(self, keys, children=None):
        self.keys = keys  # 1 to 3 keys
        self.children = children or []  # empty for a leaf


class TwoFourTree:
    """A 2-4 tree, as in Goodrich and Tamassia: every node has 2, 3 or 4
    children and every leaf is at the same depth. Keys are not repeated."""

    def __init__(self):
        self.root = None

    def search(self, k):
        x = self.root
        while x is not None:
            i = 0
            while i < len(x.keys) and k > x.keys[i]:
                i += 1
            if i < len(x.keys) and x.keys[i] == k:
                return True
            x = x.children[i] if x.children else None
        return False

    def insert(self, k):
        if self.search(k):
            return False
        if self.root is None:
            self.root = Node([k])
            return True
        split = self._insert(self.root, k)
        if split:  # the root overflowed: a new root holds its middle key
            m, right = split
            self.root = Node([m], [self.root, right])
        return True

    def _insert(self, x, k):
        """Insert k under x. If x overflows, split it and return (middle key, right half)."""
        i = 0
        while i < len(x.keys) and k > x.keys[i]:
            i += 1
        if not x.children:
            x.keys.insert(i, k)
        else:
            split = self._insert(x.children[i], k)
            if split:
                m, right = split
                x.keys.insert(i, m)
                x.children.insert(i + 1, right)
        if len(x.keys) < 4:
            return None
        # Overflow: x is a 5-node. Keep keys 1-2, the 3rd moves up, the 4th is a new node.
        right = Node(x.keys[3:], x.children[3:])
        m = x.keys[2]
        x.keys, x.children = x.keys[:2], x.children[:3]
        return m, right

    def delete(self, k):
        if not self.search(k):
            return False
        self._delete(self.root, k)
        if not self.root.keys:  # an empty root goes away
            self.root = self.root.children[0] if self.root.children else None
        return True

    def _delete(self, x, k):
        """Delete k under x, then fix any child of x that underflowed."""
        i = 0
        while i < len(x.keys) and k > x.keys[i]:
            i += 1
        if i < len(x.keys) and x.keys[i] == k:
            if not x.children:
                x.keys.pop(i)
                return
            # Swap k with its predecessor, the last key of the rightmost leaf on its left.
            leaf = x.children[i]
            while leaf.children:
                leaf = leaf.children[-1]
            x.keys[i], leaf.keys[-1] = leaf.keys[-1], x.keys[i]
        self._delete(x.children[i], k)
        if not x.children[i].keys:
            self._fix(x, i)

    def _fix(self, x, i):
        """x.children[i] has no keys: transfer a key from a sibling, or fuse with one."""
        c = x.children[i]
        left = x.children[i - 1] if i > 0 else None
        right = x.children[i + 1] if i + 1 < len(x.children) else None
        if left and len(left.keys) > 1:  # transfer from the left sibling
            c.keys.insert(0, x.keys[i - 1])
            x.keys[i - 1] = left.keys.pop()
            if left.children:
                c.children.insert(0, left.children.pop())
        elif right and len(right.keys) > 1:  # transfer from the right sibling
            c.keys.append(x.keys[i])
            x.keys[i] = right.keys.pop(0)
            if right.children:
                c.children.append(right.children.pop(0))
        elif right:  # fusion with the right sibling
            c.keys = [x.keys.pop(i)] + right.keys
            c.children += right.children
            x.children.pop(i + 1)
        else:  # fusion with the left sibling
            left.keys.append(x.keys.pop(i - 1))
            left.children += c.children
            x.children.pop(i)

    def keys(self):
        """All keys in order."""
        out = []

        def walk(x):
            for i, k in enumerate(x.keys):
                if x.children:
                    walk(x.children[i])
                out.append(k)
            if x.children:
                walk(x.children[-1])

        if self.root:
            walk(self.root)
        return out
