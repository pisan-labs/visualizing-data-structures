# Test driver: reads one operation per line, prints one result per line.
import sys

from binomial_queue import BinomialQueue


def main():
    queue = BinomialQueue()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(x) for x in parts[1:]]
        if op == "insert":
            queue.insert(args[0])
            out.append(str(len(queue)))
        elif op in ("findmin", "deletemin"):
            try:
                out.append(str(queue.find_min() if op == "findmin" else queue.extract_min()))
            except IndexError:
                out.append("empty")
        elif op == "merge":
            other = BinomialQueue()
            for key in args:
                other.insert(key)
            queue.merge_with(other)
            out.append(str(len(queue)))
        elif op == "decrease":
            node = queue.find(args[0])
            if node is None:
                out.append("missing")
            else:
                try:
                    queue.decrease_key(node, args[1])
                    out.append("ok")
                except ValueError:
                    out.append("bigger")
        elif op == "clear":
            queue.clear()
            out.append("ok")
    print("\n".join(out))


main()
