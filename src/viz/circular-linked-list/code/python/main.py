# Test driver: reads one operation per line, prints one result per line.
import sys

from circular_list import CircularLinkedList


def main():
    lst = CircularLinkedList()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "insertFront":
            lst.insert_front(args[0])
            out.append("ok")
        elif op == "insertBack":
            lst.insert_back(args[0])
            out.append("ok")
        elif op == "removeFront":
            try:
                out.append(str(lst.remove_front()))
            except IndexError:
                out.append("empty")
        elif op == "rotate":
            lst.rotate()
            out.append("ok")
        elif op == "traverse":
            out.append(" ".join(lst.traverse()) or "empty")
        elif op == "search":
            out.append(str(lst.search(args[0])))
    print("\n".join(out))


main()
