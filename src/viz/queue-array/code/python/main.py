# Test driver: reads one operation per line, prints one result per line.
import sys

from circular_queue import CircularQueue


def main():
    queue = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            queue = CircularQueue(int(args[0]))
        elif op == "enqueue":
            try:
                queue.enqueue(args[0])
                out.append("ok")
            except OverflowError:
                out.append("overflow")
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
        elif op == "clear":
            queue.clear()
            out.append("ok")
        else:
            raise ValueError("unknown operation " + op)
    print("\n".join(out))


main()
