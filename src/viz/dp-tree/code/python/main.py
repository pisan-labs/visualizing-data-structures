# Test driver: "best v1 v2 ..." builds a tree from a level-order list (_ for a gap) and prints
# the best total, then the chosen values in preorder.
import sys

from tree_choice import Node, best_choice


def build(tokens):
    if not tokens or tokens[0] == "_":
        return None
    root = Node(int(tokens[0]))
    queue = [root]
    i = 1
    while i < len(tokens) and queue:
        node = queue.pop(0)
        for side in ("left", "right"):
            if i < len(tokens) and tokens[i] != "_":
                child = Node(int(tokens[i]))
                setattr(node, side, child)
                queue.append(child)
            i += 1
    return root


def main():
    for line in sys.stdin:
        parts = line.split()
        if parts and parts[0] == "best":
            total, chosen = best_choice(build(parts[1:]))
            print(*([total] + chosen))


main()
