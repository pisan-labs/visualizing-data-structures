# Test driver: reads one operation per line, prints one result per line.
import sys

from linked_list import LinkedList


def main():
    lst = LinkedList()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        try:
            if op == "insertHead":
                lst.insert_head(args[0])
                out.append("ok")
            elif op == "insertTail":
                lst.insert_tail(args[0])
                out.append("ok")
            elif op == "insertAt":
                lst.insert_at(int(args[0]), args[1])
                out.append("ok")
            elif op == "removeHead":
                out.append(str(lst.remove_head()))
            elif op == "removeTail":
                out.append(str(lst.remove_tail()))
            elif op == "removeAt":
                out.append(str(lst.remove_at(int(args[0]))))
            elif op == "removeValue":
                out.append("true" if lst.remove_value(args[0]) else "false")
            elif op == "search":
                out.append(str(lst.search(args[0])))
            elif op == "get":
                out.append(str(lst.get(int(args[0]))))
            elif op == "reverse":
                lst.reverse()
                out.append("ok")
            elif op == "print":
                out.append(" ".join(lst) or "empty")
        except IndexError as e:
            out.append("empty" if str(e) == "list is empty" else "index error")
    print("\n".join(out))


main()
