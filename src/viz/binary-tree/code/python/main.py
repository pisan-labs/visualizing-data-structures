# Test driver: reads one operation per line, prints one result per line.
import sys

from binary_tree import build, height, inorder, level_order, postorder, preorder, size

WALKS = {"preorder": preorder, "inorder": inorder, "postorder": postorder}


def main():
    root = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "build":
            root = build([None if a == "_" else a for a in args])
            out.append(f"{size(root)} {height(root)}")
        elif op in WALKS:
            values = []
            WALKS[op](root, values)
            out.append(" ".join(values) or "empty")
        elif op == "levelorder":
            out.append(" ".join(level_order(root)) or "empty")
    print("\n".join(out))


main()
