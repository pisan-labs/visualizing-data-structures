# Test driver: reads one operation per line, prints one result per line.
import sys

from lfu_cache import LFUCache


def main():
    cache = None
    capacity = 0
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(a) for a in parts[1:]]
        if op == "new":
            capacity = args[0]
            cache = LFUCache(capacity)
        elif op == "get":
            out.append(str(cache.get(args[0])))
        elif op == "put":
            existed = args[0] in cache.entries
            evicted = cache.put(args[0], args[1])
            if existed:
                out.append("updated")
            elif evicted is not None:
                out.append(f"evict {evicted}")
            else:
                out.append("added")
        elif op == "clear":
            cache = LFUCache(capacity)
            out.append("ok")
        elif op == "print":
            lists = " ".join(
                f"{f}:{','.join(str(k) for k in cache.lists[f])}" for f in sorted(cache.lists)
            )
            out.append(f"{lists or 'empty'} | min {cache.min_freq} | {cache.hits} {cache.misses}")
    print("\n".join(out))


main()
