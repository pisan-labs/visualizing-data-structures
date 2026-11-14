# Test driver: reads one operation per line, prints one result per line.
# "node <parent> <word> <reward>" adds a node (parent -1 for the root, reward
# - for a word that is not the last); "reset" empties the search. "iterate <c>
# <u...>" runs one iteration with these random numbers and prints the path,
# the leaf and its reward, then n and W of each child of the root. "move"
# prints the most visited child.
import math
import sys

from mcts import Node, best_move, iterate


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    nodes = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "node":
            p = int(parts[1])
            parent = nodes[p] if p >= 0 else None
            node = Node(parts[2], parent, None if parts[3] == "-" else float(parts[3]))
            if parent:
                parent.children.append(node)
            nodes.append(node)
        elif op == "reset":
            for v in nodes:
                v.n, v.w, v.tried = 0, 0.0, 0
        elif op == "iterate":
            us = iter(float(t) for t in parts[2:])
            path, leaf = iterate(nodes[0], float(parts[1]), lambda: next(us))
            kids = " ".join(f"{ch.n} {three(ch.w)}" for ch in nodes[0].children)
            words = " ".join(v.word for v in path[1:])
            print(f"{words} > {leaf.word} {three(leaf.reward)} | {kids}")
        elif op == "move":
            print("move", best_move(nodes[0]).word)


main()
