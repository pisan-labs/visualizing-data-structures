# Test driver: reads one operation per line, prints one result per line.
#   insert w | delete w  ->  "ok <words> <nodes>" (the root counts as a node), or
#                            "duplicate" / "missing"
#   search w             ->  "found" or "missing"
#   startswith p         ->  the words, in order, or "none"
#   clear                ->  "ok"
import sys

from radix_tree import RadixTree


def count(x):
    """Words and nodes in the subtree at x."""
    words, nodes = int(x.end), 1
    for y in x.children.values():
        w, n = count(y)
        words += w
        nodes += n
    return words, nodes


def main():
    tree = RadixTree()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        arg = parts[1] if len(parts) > 1 else ""
        if op in ("insert", "delete"):
            done = tree.insert(arg) if op == "insert" else tree.delete(arg)
            if done:
                out.append("ok %d %d" % count(tree.root))
            else:
                out.append("duplicate" if op == "insert" else "missing")
        elif op == "search":
            out.append("found" if tree.search(arg) else "missing")
        elif op == "startswith":
            out.append(" ".join(tree.starts_with(arg)) or "none")
        elif op == "clear":
            tree = RadixTree()
            out.append("ok")
    print("\n".join(out))


main()
