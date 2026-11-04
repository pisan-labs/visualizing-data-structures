# Test driver: reads one operation per line, prints one result per line.
import sys

from chained_hash_table import ChainedHashTable


def main():
    table = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            table = ChainedHashTable(int(args[0]))
        elif op == "insert":
            k = int(args[0])
            added = table.insert(k)
            out.append(f"{table.h(k)} {'added' if added else 'present'}")
        elif op == "search":
            k = int(args[0])
            found = table.search(k) is not None
            out.append(f"{table.h(k)} {'found' if found else 'missing'}")
        elif op == "delete":
            k = int(args[0])
            deleted = table.delete(k)
            out.append(f"{table.h(k)} {'deleted' if deleted else 'missing'}")
        elif op == "clear":
            table.clear()
            out.append("ok")
        elif op == "print":
            chains = [" ".join(map(str, table.chain(i))) or "-" for i in range(table.m)]
            out.append(" | ".join(chains))
    print("\n".join(out))


main()
