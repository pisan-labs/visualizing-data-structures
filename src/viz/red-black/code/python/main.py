# Test driver: reads one operation per line, prints one result per line.
import sys

from red_black import RedBlackTree


def preorder(tree, x, out):
    if x is not tree.nil:
        out.append(f"{x.key}{x.color}")
        preorder(tree, x.left, out)
        preorder(tree, x.right, out)


def main():
    tree = RedBlackTree()
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
                preorder(tree, tree.root, shape)
                words = ["ok", tree.size, tree.height(tree.root), tree.black_height(),
                         tree.rotations - before, *shape]
                out.append(" ".join(map(str, words)))
            else:
                out.append("duplicate" if op == "insert" else "missing")
        elif op == "search":
            out.append("found" if tree.search(k) is not tree.nil else "missing")
        elif op in ("min", "max"):
            if tree.root is tree.nil:
                out.append("empty")
            else:
                x = tree.minimum(tree.root) if op == "min" else tree.maximum(tree.root)
                out.append(str(x.key))
        elif op == "inorder":
            keys = []
            tree.inorder(tree.root, keys)
            out.append(" ".join(map(str, keys)) or "empty")
        elif op == "clear":
            tree = RedBlackTree()
            out.append("ok")
    print("\n".join(out))


main()
