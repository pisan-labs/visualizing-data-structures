# Test driver: reads one operation per line, prints one result per line.
import sys

from avl import AVLTree, height


def preorder(x, out):
    if x is not None:
        out.append(str(x.key))
        preorder(x.left, out)
        preorder(x.right, out)


def main():
    tree = AVLTree()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        k = int(parts[1]) if len(parts) > 1 else None
        if op in ("insert", "delete"):
            before = tree.rotations
            done = tree.insert(k) if op == "insert" else tree.delete(k)
            if done:
                shape = []
                preorder(tree.root, shape)
                words = ["ok", tree.size, height(tree.root), tree.rotations - before, *shape]
                out.append(" ".join(map(str, words)))
            else:
                out.append("duplicate" if op == "insert" else "missing")
        elif op == "search":
            out.append("found" if tree.search(k) else "missing")
        elif op in ("min", "max"):
            if tree.root is None:
                out.append("empty")
            else:
                x = tree.minimum(tree.root) if op == "min" else tree.maximum(tree.root)
                out.append(str(x.key))
        elif op == "inorder":
            keys = []
            tree.inorder(tree.root, keys)
            out.append(" ".join(map(str, keys)) or "empty")
        elif op == "clear":
            tree = AVLTree()
            out.append("ok")
    print("\n".join(out))


main()
