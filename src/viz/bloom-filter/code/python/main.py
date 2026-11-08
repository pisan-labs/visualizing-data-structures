# Test driver: reads one operation per line, prints one result per line.
import sys

from bloom_filter import BloomFilter


def main():
    bloom = None
    inserted = set()  # only to measure false positives; the filter itself keeps no keys
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(a) for a in parts[1:]]
        if op == "new":
            bloom = BloomFilter(args[0], args[1])
        elif op == "insert":
            bloom.insert(args[0])
            inserted.add(args[0])
            out.append(" ".join(map(str, bloom.positions(args[0]))))
        elif op == "query":
            out.append("maybe" if bloom.query(args[0]) else "no")
        elif op == "delete":
            out.append("unsupported")
        elif op == "measure":
            absent = [x for x in range(1000) if x not in inserted]
            fp = sum(1 for x in absent if bloom.query(x))
            out.append(f"{fp} {len(absent)}")
        elif op == "clear":
            bloom.clear()
            inserted.clear()
            out.append("ok")
    print("\n".join(out))


main()
