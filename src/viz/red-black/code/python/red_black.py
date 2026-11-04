RED, BLACK = "R", "B"


class Node:
    def __init__(self, key, color, nil):
        self.key = key
        self.color = color
        self.left = self.right = self.parent = nil


class RedBlackTree:
    """CLRS red-black tree of distinct keys. Every missing child is the black sentinel NIL."""

    def __init__(self):
        self.nil = Node(None, BLACK, None)
        self.root = self.nil
        self.size = 0
        self.rotations = 0

    def search(self, k):
        x = self.root
        while x is not self.nil and k != x.key:
            x = x.left if k < x.key else x.right
        return x

    def _rotate_left(self, x):
        y = x.right
        x.right = y.left
        if y.left is not self.nil:
            y.left.parent = x
        self._transplant(x, y)
        y.left = x
        x.parent = y
        self.rotations += 1

    def _rotate_right(self, x):
        y = x.left
        x.left = y.right
        if y.right is not self.nil:
            y.right.parent = x
        self._transplant(x, y)
        y.right = x
        x.parent = y
        self.rotations += 1

    def _transplant(self, u, v):
        """Put the subtree rooted at v where the subtree rooted at u was."""
        if u.parent is self.nil:
            self.root = v
        elif u is u.parent.left:
            u.parent.left = v
        else:
            u.parent.right = v
        v.parent = u.parent  # v may be NIL: delete_fixup needs its parent

    def insert(self, k):
        y, x = self.nil, self.root
        while x is not self.nil:
            if k == x.key:
                return False
            y = x
            x = x.left if k < x.key else x.right
        z = Node(k, RED, self.nil)
        z.parent = y
        if y is self.nil:
            self.root = z
        elif k < y.key:
            y.left = z
        else:
            y.right = z
        self.size += 1
        self._insert_fixup(z)
        return True

    def _insert_fixup(self, z):
        while z.parent.color == RED:
            if z.parent is z.parent.parent.left:
                y = z.parent.parent.right  # the uncle
                if y.color == RED:  # case 1: recolor
                    z.parent.color = BLACK
                    y.color = BLACK
                    z.parent.parent.color = RED
                    z = z.parent.parent
                else:
                    if z is z.parent.right:  # case 2: a zigzag
                        z = z.parent
                        self._rotate_left(z)
                    z.parent.color = BLACK  # case 3: a straight line
                    z.parent.parent.color = RED
                    self._rotate_right(z.parent.parent)
            else:
                y = z.parent.parent.left
                if y.color == RED:
                    z.parent.color = BLACK
                    y.color = BLACK
                    z.parent.parent.color = RED
                    z = z.parent.parent
                else:
                    if z is z.parent.left:
                        z = z.parent
                        self._rotate_right(z)
                    z.parent.color = BLACK
                    z.parent.parent.color = RED
                    self._rotate_left(z.parent.parent)
        self.root.color = BLACK

    def delete(self, k):
        z = self.search(k)
        if z is self.nil:
            return False
        y, lost = z, z.color
        if z.left is self.nil:
            x = z.right
            self._transplant(z, z.right)
        elif z.right is self.nil:
            x = z.left
            self._transplant(z, z.left)
        else:
            y = self.minimum(z.right)  # the successor
            lost = y.color
            x = y.right
            if y is not z.right:
                self._transplant(y, y.right)
                y.right = z.right
                y.right.parent = y
            else:
                x.parent = y
            self._transplant(z, y)
            y.left = z.left
            y.left.parent = y
            y.color = z.color
        self.size -= 1
        if lost == BLACK:
            self._delete_fixup(x)
        return True

    def _delete_fixup(self, x):
        """x carries an extra black: move it up the tree or use it up."""
        while x is not self.root and x.color == BLACK:
            if x is x.parent.left:
                w = x.parent.right  # the sibling
                if w.color == RED:  # case 1
                    w.color = BLACK
                    x.parent.color = RED
                    self._rotate_left(x.parent)
                    w = x.parent.right
                if w.left.color == BLACK and w.right.color == BLACK:  # case 2
                    w.color = RED
                    x = x.parent
                else:
                    if w.right.color == BLACK:  # case 3
                        w.left.color = BLACK
                        w.color = RED
                        self._rotate_right(w)
                        w = x.parent.right
                    w.color = x.parent.color  # case 4
                    x.parent.color = BLACK
                    w.right.color = BLACK
                    self._rotate_left(x.parent)
                    x = self.root
            else:
                w = x.parent.left
                if w.color == RED:
                    w.color = BLACK
                    x.parent.color = RED
                    self._rotate_right(x.parent)
                    w = x.parent.left
                if w.right.color == BLACK and w.left.color == BLACK:
                    w.color = RED
                    x = x.parent
                else:
                    if w.left.color == BLACK:
                        w.right.color = BLACK
                        w.color = RED
                        self._rotate_left(w)
                        w = x.parent.left
                    w.color = x.parent.color
                    x.parent.color = BLACK
                    w.left.color = BLACK
                    self._rotate_right(x.parent)
                    x = self.root
        x.color = BLACK

    def minimum(self, x):
        while x.left is not self.nil:
            x = x.left
        return x

    def maximum(self, x):
        while x.right is not self.nil:
            x = x.right
        return x

    def black_height(self):
        """Black nodes on any path from the root down to NIL, not counting the root."""
        if self.root is self.nil:
            return 0
        count, x = 1, self.root.left  # the 1 is the NIL at the end
        while x is not self.nil:
            if x.color == BLACK:
                count += 1
            x = x.left
        return count

    def height(self, x):
        if x is self.nil:
            return -1
        return 1 + max(self.height(x.left), self.height(x.right))

    def inorder(self, x, out):
        if x is not self.nil:
            self.inorder(x.left, out)
            out.append(x.key)
            self.inorder(x.right, out)
