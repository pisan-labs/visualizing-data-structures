# Test driver: "build v1 v2 ..." makes the list; "reverse k" reverses it in groups of k (a
# short last group stays), "reverse k all" reverses a short last group too; both print the list.
import sys

from reverse_k import Node, reverse_k_group


def main():
    head = None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "build":
            head = None
            for v in reversed(parts[1:]):
                head = Node(int(v), head)
        elif parts[0] == "reverse":
            head = reverse_k_group(head, int(parts[1]), parts[2:] == ["all"])
            out = []
            node = head
            while node:
                out.append(str(node.value))
                node = node.next
            print(" ".join(out))


main()
