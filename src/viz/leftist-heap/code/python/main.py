# Test driver: reads one operation per line, prints one result per line.
import sys

from leftist_heap import LeftistHeap


def main():
    heap = LeftistHeap()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(x) for x in parts[1:]]
        if op == "insert":
            heap.insert(args[0])
            out.append(str(len(heap)))
        elif op == "deletemin":
            try:
                out.append(str(heap.delete_min()))
            except IndexError:
                out.append("empty")
        elif op == "merge":
            other = LeftistHeap()
            for key in args:
                other.insert(key)
            heap.merge_with(other)
            out.append(str(len(heap)))
        elif op == "clear":
            heap.clear()
            out.append("ok")
    print("\n".join(out))


main()
