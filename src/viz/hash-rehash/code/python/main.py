# Test driver: reads one operation per line, prints one result per line.
import sys

from resizing_table import ResizingTable


def main():
    table = None
    start = 0
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            start = int(args[0])
            table = ResizingTable(start)
        elif op == "insert":
            cost = table.insert(int(args[0]))
            m = table.capacity()
            out.append(f"added {m} {cost}" if cost else f"present {m}")
        elif op == "search":
            j = table.search(int(args[0]))
            out.append("missing" if j is None else f"found {j}")
        elif op == "clear":
            table = ResizingTable(start)
            out.append("ok")
        elif op == "print":
            cells = " ".join("-" if x is None else str(x) for x in table.T)
            out.append(f"{cells} | {table.total}")
    print("\n".join(out))


main()
