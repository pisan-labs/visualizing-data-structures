# Test driver: reads one operation per line, prints one result per line.
import sys

from linked_queue import LinkedQueue


def main():
    queue = LinkedQueue()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "enqueue":
            queue.enqueue(parts[1])
            out.append("ok")
        elif op == "dequeue":
            try:
                out.append(str(queue.dequeue()))
            except IndexError:
                out.append("underflow")
        elif op == "peek":
            try:
                out.append(str(queue.peek()))
            except IndexError:
                out.append("empty")
        else:
            raise ValueError("unknown operation " + op)
    print("\n".join(out))


main()
