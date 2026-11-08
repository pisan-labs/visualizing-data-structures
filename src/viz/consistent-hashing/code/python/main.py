# Test driver: reads one operation per line, prints one result per line.
import sys

from hash_ring import HashRing


def main():
    ring = None
    keys = []  # the keys stored, in the order they were added
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            ring = HashRing(int(args[0]))
        elif op in ("addKey", "lookup"):
            k = int(args[0])
            if op == "addKey" and k not in keys:
                keys.append(k)
            out.append(ring.lookup(k) or "none")
        elif op in ("addServer", "removeServer"):
            before = {k: ring.lookup(k) for k in keys}
            if op == "addServer":
                ring.add_server(args[0])
            else:
                ring.remove_server(args[0])
            moved = [str(k) for k in keys if ring.lookup(k) != before[k]]
            out.append(" ".join(moved) if moved else "none")
        elif op == "clear":
            keys = []
            out.append("ok")
    print("\n".join(out))


main()
