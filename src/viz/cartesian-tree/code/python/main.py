# Test driver: reads one operation per line, prints one result per line.
import sys

from cartesian_tree import CartesianTree


def main():
    tree = CartesianTree()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "append":
            pops = tree.append(int(parts[1]))
            keys = []
            tree.preorder(tree.root, keys)
            out.append(" ".join(map(str, ["ok", pops, *keys])))
        elif op == "rmq":
            i, j = sorted((int(parts[1]), int(parts[2])))
            if j >= len(tree.values):
                out.append("bad")
            else:
                x, visited = tree.rmq(i, j)
                out.append(f"{x} {tree.values[x]} {visited}")
        elif op == "clear":
            tree = CartesianTree()
            out.append("ok")
    print("\n".join(out))


main()
