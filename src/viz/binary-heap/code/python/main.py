# Test driver: reads one operation per line, prints one result per line.
import sys

from max_heap import MaxHeap


def main():
    heap = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(x) for x in parts[1:]]
        if op == "new":
            heap = MaxHeap(args[0])
        elif op == "insert":
            try:
                heap.insert(args[0])
                out.append(str(len(heap)))
            except OverflowError:
                out.append("overflow")
        elif op == "extract":
            try:
                out.append(str(heap.extract_max()))
            except IndexError:
                out.append("empty")
        elif op == "peek":
            try:
                out.append(str(heap.maximum()))
            except IndexError:
                out.append("empty")
        elif op == "build":
            heap.build(args)
            out.append(str(len(heap)))
        elif op == "update":
            try:
                heap.update_key(args[0], args[1])
                out.append("ok")
            except IndexError:
                out.append("invalid")
        elif op == "delete":
            try:
                out.append(str(heap.delete(args[0])))
            except IndexError:
                out.append("invalid")
        elif op == "clear":
            heap.clear()
            out.append("ok")
    print("\n".join(out))


main()
