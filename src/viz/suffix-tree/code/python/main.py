# Test driver: reads one operation per line, prints one result per line.
# "build T" prints the tree as nested edge labels, "search T P" the positions of P
# (or "none"), "count T P" how often P occurs, "repeat T" the longest repeat (or "none").
import sys

from suffix_tree import SuffixTree


def nested(tree, u, top=True):
    inner = " ".join(nested(tree, u.kids[ch], False) for ch in sorted(u.kids))
    label = "" if top else tree.label(u)
    return f"{label}({inner})" if u.kids else label


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, tree = parts[0], SuffixTree(parts[1])
        if op == "build":
            print(nested(tree, tree.root))
        elif op == "search":
            found = tree.search(parts[2])
            print(" ".join(map(str, found)) if found else "none")
        elif op == "count":
            print(tree.count(parts[2]))
        elif op == "repeat":
            print(tree.longest_repeat() or "none")


main()
