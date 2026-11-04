# Test driver: reads one operation per line, prints one result per line.
import sys

from skip_list import SkipList


def main():
    sl = SkipList()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        k = int(parts[1]) if len(parts) > 1 else None
        if op in ("insert", "delete"):
            done = sl.insert(k) if op == "insert" else sl.delete(k)
            if done:
                out.append(" ".join(["ok", *map(str, sl.keys())]))
            else:
                out.append("duplicate" if op == "insert" else "missing")
        elif op == "search":
            out.append("found" if sl.search(k) else "missing")
        elif op == "clear":
            sl = SkipList()
            out.append("ok")
    print("\n".join(out))


main()
