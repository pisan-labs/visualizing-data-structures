# Test driver: reads one operation per line, prints one result per line.
import sys

from bst import BST


def key_or(node, missing):
    return missing if node is None else str(node.key)


def main():
    tree = BST()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        k = int(parts[1]) if len(parts) > 1 else None
        if op in ("insert", "delete"):
            done = tree.insert(k) if op == "insert" else tree.delete(k)
            if done:
                n = 0 if tree.root is None else tree.root.size
                out.append(f"ok {n} {tree.height(tree.root)}")
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
        elif op in ("successor", "predecessor"):
            x = tree.search(k)
            if x is None:
                out.append("missing")
            else:
                y = tree.successor(x) if op == "successor" else tree.predecessor(x)
                out.append(key_or(y, "none"))
        elif op == "select":
            out.append(key_or(tree.select(k), "none"))
        elif op == "rank":
            r = tree.rank(k)
            out.append("missing" if r is None else str(r))
        elif op == "lowerbound":
            out.append(key_or(tree.lower_bound(k), "none"))
        elif op == "inorder":
            keys = []
            tree.inorder(tree.root, keys)
            out.append(" ".join(map(str, keys)) or "empty")
        elif op == "clear":
            tree.root = None
            out.append("ok")
    print("\n".join(out))


main()
