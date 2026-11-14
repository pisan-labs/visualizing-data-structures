# Test driver: reads one operation per line, prints one result per line.
# Real threads are not deterministic, so Steps drives the steps one at a time;
# "threads" runs BoundedBuffer on real threads, where every item gets through once.
import sys

from buffer import Steps, run_threads

NAMES = ["P1", "C1", "C2"]


def show(c):
    names = lambda ts: ",".join(NAMES[t] for t in ts) or "-"
    holder = "-" if c.holder is None else NAMES[c.holder]
    return (
        f"n={c.n} holder={holder} line={names(c.line)} "
        f"room={names(c.sleep['room'])} item={names(c.sleep['item'])}"
    )


def main():
    out = []
    size = start = 0
    c = None
    for raw in sys.stdin:
        parts = raw.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            size, start = int(args[0]), int(args[1])
            c = Steps(size, start)
        elif op == "step":
            t = int(args[0]) - 1
            if c.step(t):
                out.append(show(c))
            else:
                out.append("waits" if c.blocked[t] else "done")
        elif op == "run":
            c = Steps(size, start)
            ok = all(c.step(int(d) - 1) for d in args[0])
            out.append(show(c) if ok else "stopped")
        elif op == "reset":
            c = Steps(size, start)
            out.append(f"n={start}")
        elif op == "threads":
            total, left = run_threads(int(args[0]))
            out.append(f"{total} {left}")
    print("\n".join(out))


main()
