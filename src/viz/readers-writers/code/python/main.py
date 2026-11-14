# Test driver: reads one operation per line, prints one result per line.
# Real threads are not deterministic, so Steps drives the steps one at a time;
# "threads" runs real readers and a writer on RWLock, which never share with a writer.
import sys

from rwlock import Steps, run_threads


def name(t):
    return "W" if t == 0 else f"R{t}"


def show(c):
    m = "-" if c.holder is None else name(c.holder)
    waiting = ",".join(f"{name(t)}:{w}" for t, w in enumerate(c.waits) if w) or "-"
    return f"n={c.n} room={c.room} m={m} waiting={waiting}"


def main():
    out = []
    k, c = 2, None
    for raw in sys.stdin:
        parts = raw.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            k = int(args[1])
            c = Steps(k)
        elif op == "step":
            t = int(args[0]) - 1
            if t > k:
                out.append("none")
            elif c.step(t):
                out.append(show(c))
            else:
                out.append("waits" if c.waits[t] else "done")
        elif op == "run":
            c = Steps(k)
            ok = all(0 <= int(d) - 1 <= k and c.step(int(d) - 1) for d in args[0])
            out.append(show(c) if ok else "stopped")
        elif op == "reset":
            c = Steps(k)
            out.append("n=0")
        elif op == "threads":
            bad = run_threads(k, 200) + run_threads(k, 200, no_starve=True)
            out.append("ok" if bad == 0 else "shared")
    print("\n".join(out))


main()
