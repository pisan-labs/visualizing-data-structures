# Test driver: reads one operation per line, prints one result per line.
import sys

from quadtree import QuadTree


def main():
    capacity = 1
    tree = QuadTree(capacity)
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, n = parts[0], [int(t) for t in parts[1:]]
        if op == "capacity":
            capacity = n[0]
            tree = QuadTree(capacity)
        elif op == "clear":
            tree = QuadTree(capacity)
        elif op == "insert":
            tree.insert((n[0], n[1]))
        elif op == "query":
            pts = sorted(tree.query((n[0], n[1]), (n[2], n[3])))
            out.append(" ".join(f"{x},{y}" for x, y in pts) if pts else "none")
        elif op == "stats":
            nodes, height = tree.stats()
            out.append(f"nodes={nodes} height={height}")
    sys.stdout.write("".join(line + "\n" for line in out))


main()
