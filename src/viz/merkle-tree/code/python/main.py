# Test driver: reads one operation per line, prints one result per line.
import sys

from merkle_tree import MerkleTree, verify

MAX_BLOCKS = 8  # the page draws at most this many


def main():
    tree = MerkleTree()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "build":
            tree = MerkleTree(args)
            out.append(tree.root())
        elif op == "update":
            try:
                tree.update(int(args[0]), args[1])
                out.append(tree.root())
            except IndexError:
                out.append("invalid")
        elif op == "append":
            if len(tree.blocks) >= MAX_BLOCKS:
                out.append("full")
            else:
                tree.append(args[0])
                out.append(tree.root())
        elif op == "prove":
            try:
                proof = tree.proof(int(args[0]))
                out.append(" ".join(f"{side}:{h}" for side, h in proof) or "-")
            except IndexError:
                out.append("invalid")
        elif op == "verify":
            try:
                proof = tree.proof(int(args[0]))
                out.append("ok" if verify(args[1], proof, tree.root()) else "bad")
            except IndexError:
                out.append("invalid")
        elif op == "clear":
            tree = MerkleTree()
            out.append("ok")
    print("\n".join(out))


main()
