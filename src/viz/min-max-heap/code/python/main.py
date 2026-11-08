# Test driver: reads one operation per line, prints one result per line.
import sys

from min_max_heap import MinMaxHeap


def main():
    heap = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(x) for x in parts[1:]]
        if op == "new":
            heap = MinMaxHeap(args[0])
        elif op == "insert":
            try:
                heap.insert(args[0])
                out.append(str(len(heap)))
            except OverflowError:
                out.append("overflow")
        elif op in ("extractMin", "extractMax"):
            try:
                out.append(str(heap.extract_min() if op == "extractMin" else heap.extract_max()))
            except IndexError:
                out.append("empty")
        elif op == "build":
            heap.build(args)
            out.append(str(len(heap)))
        elif op == "clear":
            heap.clear()
            out.append("ok")
    print("\n".join(out))


main()
