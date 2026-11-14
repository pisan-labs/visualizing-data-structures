# Test driver: "build v1 v2 ..." makes the list; "middle" (or "middle first") prints the
# middle value; "kth k" prints the k-th value from the end, or "none"; "palindrome" prints
# true or false, then the list must be unchanged ("list" prints it).
import sys

from fast_slow import Node, first_middle, is_palindrome, kth_from_end, middle


def build(values):
    head = None
    for v in reversed(values):
        head = Node(v, head)
    return head


def values(head):
    out = []
    while head:
        out.append(str(head.value))
        head = head.next
    return " ".join(out)


def main():
    head = None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "build":
            head = build([int(x) for x in parts[1:]])
        elif cmd == "middle":
            node = first_middle(head) if parts[1:] == ["first"] else middle(head)
            print(node.value)
        elif cmd == "kth":
            node = kth_from_end(head, int(parts[1]))
            print("none" if node is None else node.value)
        elif cmd == "palindrome":
            print("true" if is_palindrome(head) else "false")
        elif cmd == "list":
            print(values(head))


main()
