# Test driver: reads one operation per line, prints one line per result.
import sys

from two_stack_queue import TwoStackQueue


def main():
    queue = TwoStackQueue()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "enqueue":
            queue.enqueue(int(parts[1]))
        elif len(queue) == 0:
            out.append("empty")
        elif op == "dequeue":
            out.append(str(queue.dequeue()))
        elif op == "peek":
            out.append(str(queue.peek()))
    print("\n".join(out))


main()
