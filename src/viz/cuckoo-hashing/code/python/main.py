# Test driver: reads one operation per line, prints one result per line.
import sys

from cuckoo_table import CuckooTable


def main():
    table = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(a) for a in parts[1:]]
        if op == "new":
            table = CuckooTable(args[0])
        elif op == "insert":
            before = table.rehashes
            if table.insert(args[0]):
                grew = f" rehash {table.m}" if table.rehashes != before else ""
                out.append(f"added {table.kicks}{grew}")
            else:
                out.append("present")
        elif op == "search":
            i = table.search(args[0])
            out.append(f"found {i}" if i else "missing")
        elif op == "delete":
            out.append("deleted" if table.delete(args[0]) else "missing")
        elif op == "clear":
            table.T = [[None] * table.m, [None] * table.m]
            out.append("ok")
        elif op == "print":
            row = lambda t: " ".join("-" if x is None else str(x) for x in t)
            out.append(f"{row(table.T[0])} | {row(table.T[1])}")
    print("\n".join(out))


main()
