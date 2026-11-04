# Test driver: reads one operation per line, prints one result per line.
import sys

from bucket_hash_table import BucketHashTable


def main():
    table = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            table = BucketHashTable(int(args[0]), int(args[1]))
        elif op == "insert":
            added = table.insert(int(args[0]))
            out.append(f"{'added' if added else 'present'} {table.probes}")
        elif op == "search":
            found = table.search(int(args[0]))
            out.append(f"{'found' if found else 'missing'} {table.probes}")
        elif op == "delete":
            deleted = table.delete(int(args[0]))
            out.append(f"{'deleted' if deleted else 'missing'} {table.probes}")
        elif op == "clear":
            table.clear()
            out.append("ok")
        elif op == "print":
            def show(x):
                return "-" if x is None else str(x)

            buckets = " | ".join(" ".join(map(show, bucket)) for bucket in table.buckets)
            overflow = " ".join(map(str, table.overflow)) or "-"
            out.append(f"{buckets} || {overflow}")
    print("\n".join(out))


main()
