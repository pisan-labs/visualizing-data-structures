# Test driver: reads one operation per line, prints one result per line.
import sys

from sorted_array import SortedArray


def main():
    array = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        x = int(parts[1]) if len(parts) > 1 else None
        if op == "new":
            array = SortedArray(x)
        elif op == "insert":
            try:
                array.insert(x)
                out.append("ok")
            except OverflowError:
                out.append("full")
        elif op == "delete":
            out.append("ok" if array.delete(x) else "missing")
        elif op == "search":
            out.append(str(array.search(x)))
        elif op == "contains":
            out.append("true" if array.search(x) != -1 else "false")
        elif op in ("min", "max"):
            try:
                out.append(str(getattr(array, op)()))
            except IndexError:
                out.append("empty")
        elif op == "lowerBound":
            out.append(str(array.lower_bound(x)))
        elif op == "upperBound":
            out.append(str(array.upper_bound(x)))
        else:
            raise ValueError("unknown operation " + op)
    print("\n".join(out))


main()
