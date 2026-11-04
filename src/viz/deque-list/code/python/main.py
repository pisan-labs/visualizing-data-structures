# Test driver: reads one operation per line, prints one result per line.
import sys

from linked_deque import LinkedDeque


def main():
    deque = LinkedDeque()
    out = []
    adds = {"addFirst": deque.add_first, "addLast": deque.add_last}
    removes = {"removeFirst": deque.remove_first, "removeLast": deque.remove_last}
    peeks = {"peekFirst": deque.peek_first, "peekLast": deque.peek_last}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op in adds:
            adds[op](parts[1])
            out.append("ok")
        elif op in removes:
            try:
                out.append(str(removes[op]()))
            except IndexError:
                out.append("underflow")
        elif op in peeks:
            try:
                out.append(str(peeks[op]()))
            except IndexError:
                out.append("empty")
        else:
            raise ValueError("unknown operation " + op)
    print("\n".join(out))


main()
