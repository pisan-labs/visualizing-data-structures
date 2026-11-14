# Test driver: "build 1 4 7 | 2 3 8" makes the sorted lists (separated by |, "empty" for an
# empty one); "merge" merges them all into one and prints its values, or "empty".
import sys

from merge import Node, merge_all


def build(values):
    head = None
    for v in reversed(values):
        head = Node(v, head)
    return head


def main():
    lists = []
    for line in sys.stdin:
        parts = line.split(maxsplit=1)
        if not parts:
            continue
        if parts[0] == "build":
            groups = parts[1].split("|")
            lists = [build([int(x) for x in g.split() if x != "empty"]) for g in groups]
        elif parts[0] == "merge":
            head = merge_all(lists)
            lists = [head]
            out = []
            while head:
                out.append(str(head.value))
                head = head.next
            print(" ".join(out) or "empty")


main()
