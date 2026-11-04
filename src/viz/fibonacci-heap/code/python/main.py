# Test driver: reads one operation per line, prints one result per line.
import sys

from fibonacci_heap import FibonacciHeap


def main():
    heap = FibonacciHeap()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(x) for x in parts[1:]]
        if op == "insert":
            heap.insert(args[0])
            out.append(str(len(heap)))
        elif op in ("findmin", "deletemin"):
            try:
                out.append(str(heap.minimum() if op == "findmin" else heap.extract_min()))
            except IndexError:
                out.append("empty")
        elif op == "union":
            other = FibonacciHeap()
            for key in args:
                other.insert(key)
            heap.merge_with(other)
            out.append(str(len(heap)))
        elif op in ("decrease", "delete"):
            node = heap.find(args[0])
            if node is None:
                out.append("missing")
            elif op == "delete":
                heap.delete(node)
                out.append("ok")
            else:
                try:
                    heap.decrease_key(node, args[1])
                    out.append("ok")
                except ValueError:
                    out.append("bigger")
        elif op == "clear":
            heap.clear()
            out.append("ok")
    print("\n".join(out))


main()
