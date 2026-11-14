# Test driver: reads one operation per line, prints one result per line.
# Real threads are not deterministic, so Room drives the steps one at a time;
# "threads" runs a pattern on real threads, where the semaphores fix the result.
import sys

from semaphores import Room, first, limit, turns


def show(r):
    line = ",".join(f"T{t + 1}" for t in r.line) or "-"
    return f"s={r.s} line={line} out={','.join(r.out) or '-'}"


def main():
    out = []
    room = 0
    r = None
    for raw in sys.stdin:
        parts = raw.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            room = int(args[0])
            r = Room(room)
        elif op == "step":
            t = int(args[0]) - 1
            if t >= 3:
                out.append("none")
            elif r.step(t):
                out.append(show(r))
            else:
                out.append("waits" if t in r.line else "done")
        elif op == "run":
            r = Room(room)
            ok = all(0 <= int(d) - 1 < 3 and r.step(int(d) - 1) for d in args[0])
            out.append(show(r) if ok else "stopped")
        elif op == "reset":
            r = Room(room)
            out.append(f"s={room}")
        elif op == "threads":
            pattern, k = args[0], int(args[1])
            if pattern == "limit":
                out.append("ok" if limit(3, k) <= k else "too many")
            else:
                out.append(" ".join(first() if pattern == "first" else turns()))
    print("\n".join(out))


main()
