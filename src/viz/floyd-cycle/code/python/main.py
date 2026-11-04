# Test driver: reads one operation per line, prints one result per line.
import sys

from floyd import Node, find_cycle


def build(tokens):
    """'1 2 3 4 @1': link the nodes in order; the last one points back to index 1."""
    loop = None
    if tokens and tokens[-1].startswith("@"):
        loop = int(tokens[-1][1:])
        tokens = tokens[:-1]
    nodes = [Node(v) for v in tokens]
    for a, b in zip(nodes, nodes[1:]):
        a.next = b
    if loop is not None:
        nodes[-1].next = nodes[loop]
    return nodes[0] if nodes else None


def main():
    head = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "build":
            head = build(parts[1:])
            out.append("ok")
        elif parts[0] == "detect":
            found = find_cycle(head)
            out.append("none" if found is None else f"{found[0]} {found[1]}")
    print("\n".join(out))


main()
