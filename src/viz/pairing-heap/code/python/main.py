# Test driver: reads one operation per line, prints one result per line.
import sys

from pairing_heap import PairingHeap

CAPACITY = 31  # the page draws at most this many keys


def main():
    heap = PairingHeap()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(x) for x in parts[1:]]
        if op == "insert":
            if len(heap) >= CAPACITY:
                out.append("full")
            else:
                heap.insert(args[0])
                out.append(str(len(heap)))
        elif op == "deleteMin":
            try:
                out.append(str(heap.delete_min()))
            except IndexError:
                out.append("empty")
        elif op == "decrease":
            node = heap.find(args[0])
            if node is None:
                out.append("missing")
            else:
                try:
                    heap.decrease_key(node, args[1])
                    out.append("ok")
                except ValueError:
                    out.append("larger")
        elif op == "meld":
            if len(heap) + len(args) > CAPACITY:
                out.append("full")
            else:
                other = PairingHeap()
                for k in args:
                    other.insert(k)
                heap.meld_with(other)
                out.append(str(len(heap)))
        elif op == "clear":
            heap.clear()
            out.append("ok")
    print("\n".join(out))


main()
