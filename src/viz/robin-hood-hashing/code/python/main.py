# Test driver: reads one operation per line, prints one result per line.
import sys

from robin_hood_table import RobinHoodTable


def main():
    table = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(a) for a in parts[1:]]
        if op == "new":
            table = RobinHoodTable(args[0])
        elif op == "insert":
            try:
                swaps = table.insert(args[0])
                out.append("present" if swaps is None else f"added {table.probes} {swaps}")
            except OverflowError:
                out.append("full")
        elif op == "search":
            j = table.search(args[0])
            out.append(f"missing {table.probes}" if j is None else f"found {j} {table.probes}")
        elif op == "delete":
            shifts = table.delete(args[0])
            out.append("missing" if shifts is None else f"deleted {shifts}")
        elif op == "clear":
            table = RobinHoodTable(table.m)
            out.append("ok")
        elif op == "print":
            out.append(" ".join("-" if x is None else str(x) for x in table.T))
    print("\n".join(out))


main()
