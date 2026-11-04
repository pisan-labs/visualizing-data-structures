# Test driver: reads one operation per line, prints one result per line.
import sys

from array_deque import ArrayDeque


def main():
    deque = None
    out = []
    adds = {"addFirst": "add_first", "addLast": "add_last"}
    removes = {"removeFirst": "remove_first", "removeLast": "remove_last"}
    peeks = {"peekFirst": "peek_first", "peekLast": "peek_last"}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            deque = ArrayDeque(int(args[0]))
        elif op in adds:
            try:
                getattr(deque, adds[op])(args[0])
                out.append("ok")
            except OverflowError:
                out.append("overflow")
        elif op in removes:
            try:
                out.append(str(getattr(deque, removes[op])()))
            except IndexError:
                out.append("underflow")
        elif op in peeks:
            try:
                out.append(str(getattr(deque, peeks[op])()))
            except IndexError:
                out.append("empty")
        else:
            raise ValueError("unknown operation " + op)
    print("\n".join(out))


main()
