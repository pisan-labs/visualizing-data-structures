# Test driver: reads one operation per line, prints one result per line.
import sys

from aa_tree import AATree


def preorder(t, out):
    if t is not None:
        out.append(f"{t.key}:{t.level}")
        preorder(t.left, out)
        preorder(t.right, out)


def inorder(t, out):
    if t is not None:
        inorder(t.left, out)
        out.append(t.key)
        inorder(t.right, out)


def main():
    tree = AATree()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        k = int(parts[1]) if len(parts) > 1 else None
        if op in ("insert", "delete"):
            skews, splits = tree.skews, tree.splits
            done = tree.insert(k) if op == "insert" else tree.delete(k)
            if done:
                shape = []
                preorder(tree.root, shape)
                words = ["ok", tree.size, tree.skews - skews, tree.splits - splits, *shape]
                out.append(" ".join(map(str, words)))
            else:
                out.append("duplicate" if op == "insert" else "missing")
        elif op == "search":
            out.append("found" if tree.search(k) else "missing")
        elif op == "inorder":
            keys = []
            inorder(tree.root, keys)
            out.append(" ".join(map(str, keys)) or "empty")
        elif op == "clear":
            tree = AATree()
            out.append("ok")
    print("\n".join(out))


main()
