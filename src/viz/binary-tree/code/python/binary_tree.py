from collections import deque


class Node:
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None


def build(values):
    """Build a tree from a level-order list. None marks a missing child,
    and only real nodes get children."""
    if not values or values[0] is None:
        return None
    root = Node(values[0])
    queue = deque([root])
    i = 1
    while i < len(values):
        x = queue.popleft()
        if values[i] is not None:
            x.left = Node(values[i])
            queue.append(x.left)
        if i + 1 < len(values) and values[i + 1] is not None:
            x.right = Node(values[i + 1])
            queue.append(x.right)
        i += 2
    return root


def preorder(x, out):
    if x is not None:
        out.append(x.value)
        preorder(x.left, out)
        preorder(x.right, out)


def inorder(x, out):
    if x is not None:
        inorder(x.left, out)
        out.append(x.value)
        inorder(x.right, out)


def postorder(x, out):
    if x is not None:
        postorder(x.left, out)
        postorder(x.right, out)
        out.append(x.value)


def level_order(root):
    out = []
    if root is None:
        return out
    queue = deque([root])
    while queue:
        x = queue.popleft()
        out.append(x.value)
        if x.left is not None:
            queue.append(x.left)
        if x.right is not None:
            queue.append(x.right)
    return out


def size(x):
    return 0 if x is None else 1 + size(x.left) + size(x.right)


def height(x):
    """Edges on the longest path down from x; -1 for an empty tree."""
    return -1 if x is None else 1 + max(height(x.left), height(x.right))
