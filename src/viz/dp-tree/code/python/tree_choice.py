class Node:
    def __init__(self, value, left=None, right=None):
        self.value = value
        self.left = left
        self.right = right


def take_skip(node, memo):
    """(take, skip): the best total in node's subtree with node chosen, and without it."""
    if node is None:
        return 0, 0
    lt, ls = take_skip(node.left, memo)
    rt, rs = take_skip(node.right, memo)
    take = node.value + ls + rs  # node in: both children stay out
    skip = max(lt, ls) + max(rt, rs)  # node out: each child gives its better value
    memo[node] = (take, skip)
    return take, skip


def best_choice(root):
    """The best total with no chosen node the parent of another, and the chosen values in preorder."""
    memo = {}
    take, skip = take_skip(root, memo)
    chosen = []

    def walk(node, parent_in):
        if node is None:
            return
        t, s = memo[node]
        use = not parent_in and t > s  # a tie leaves the node out
        if use:
            chosen.append(node.value)
        walk(node.left, use)
        walk(node.right, use)

    walk(root, False)
    return max(take, skip), chosen
