# Test driver: reads one operation per line, prints one result per line.
import sys

from splay import SplayTree


def preorder(x, out):
    if x is not None:
        out.append(str(x.key))
        preorder(x.left, out)
        preorder(x.right, out)


def shape(tree):
    keys = []
    preorder(tree.root, keys)
    return " ".join(keys)


def main():
    tree = SplayTree()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        k = int(parts[1]) if len(parts) > 1 else None
        before = tree.rotations
        if op in ("insert", "delete"):
            done = tree.insert(k) if op == "insert" else tree.delete(k)
            result = "ok" if done else ("duplicate" if op == "insert" else "missing")
            words = [result, tree.size, tree.height(tree.root), tree.rotations - before, shape(tree)]
            out.append(" ".join(map(str, words)).rstrip())
        elif op == "search":
            found = tree.search(k)
            words = ["found" if found else "missing", tree.rotations - before, shape(tree)]
            out.append(" ".join(map(str, words)).rstrip())
        elif op in ("min", "max"):
            if tree.root is None:
                out.append("empty")
            else:
                x = tree.minimum() if op == "min" else tree.maximum()
                out.append(f"{x.key} {tree.rotations - before} {shape(tree)}")
        elif op == "inorder":
            keys = []
            tree.inorder(tree.root, keys)
            out.append(" ".join(map(str, keys)) or "empty")
        elif op == "clear":
            tree = SplayTree()
            out.append("ok")
    print("\n".join(out))


main()
