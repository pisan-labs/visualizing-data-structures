# Test driver: reads one operation per line, prints one result per line.
import sys

from lru_cache import LRUCache


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
            cache = LRUCache(capacity)
        elif op == "get":
            out.append(str(cache.get(args[0])))
        elif op == "put":
            existed = args[0] in cache.map
            evicted = cache.put(args[0], args[1])
            if existed:
                out.append("updated")
            elif evicted is not None:
                out.append(f"evict {evicted}")
            else:
                out.append("added")
        elif op == "clear":
            cache = LRUCache(capacity)
            out.append("ok")
        elif op == "print":
            entries = " ".join(f"{k}={v}" for k, v in cache.items()) or "empty"
            out.append(f"{entries} | {cache.hits} {cache.misses}")
    print("\n".join(out))


main()
