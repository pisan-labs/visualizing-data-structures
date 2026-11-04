# Test driver: reads one operation per line, prints one result per line.
import sys

from linear_probing import DELETED, LinearProbingTable


def main():
    table = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            table = LinearProbingTable(int(args[0]))
        elif op == "insert":
            try:
                added = table.insert(int(args[0]))
                out.append(f"{'added' if added else 'present'} {table.probes}")
            except OverflowError:
                out.append(f"full {table.probes}")
        elif op == "search":
            j = table.search(int(args[0]))
            out.append(f"missing {table.probes}" if j is None else f"found {j} {table.probes}")
        elif op == "delete":
            deleted = table.delete(int(args[0]))
            out.append(f"{'deleted' if deleted else 'missing'} {table.probes}")
        elif op == "clear":
            table.clear()
            out.append("ok")
        elif op == "print":
            cells = ["-" if x is None else "DEL" if x is DELETED else str(x) for x in table.T]
            out.append(" ".join(cells))
    print("\n".join(out))


main()
