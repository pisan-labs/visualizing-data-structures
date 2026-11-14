import math


class Node:
    def __init__(self, word, parent=None, reward=None):
        self.word, self.parent, self.reward = word, parent, reward
        self.children = []  # every next word, in order
        self.tried = 0  # how many children are in the search tree (left to right)
        self.n, self.w = 0, 0.0  # visits and total reward

    def ucb(self, c):
        """UCB1: the mean reward, plus a bonus for being tried less often."""
        return self.w / self.n + c * math.sqrt(math.log(self.parent.n) / self.n)


def iterate(root, c, random):
    """One iteration of Monte Carlo tree search; random() gives a number in
    [0, 1). Returns the path from the root and the leaf the rollout reached."""
    path, node = [root], root
    # Selection: while every child is in the tree, follow the best UCB1.
    while node.children and node.tried == len(node.children):
        node = max(node.children, key=lambda ch: ch.ucb(c))  # first on a tie
        path.append(node)
    # Expansion: add the first child not tried yet.
    if node.children:
        node.tried += 1
        node = node.children[node.tried - 1]
        path.append(node)
    # Rollout: random children until the end; the leaf has the reward.
    leaf = node
    while leaf.children:
        leaf = leaf.children[math.floor(random() * len(leaf.children))]
    # Backpropagation: every node on the path gets the visit and the reward.
    for v in path:
        v.n += 1
        v.w += leaf.reward
    return path, leaf


def best_move(root):
    """The most visited child of the root (the first on a tie)."""
    return max(root.children, key=lambda ch: ch.n)
