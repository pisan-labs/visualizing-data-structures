# Test driver: reads one operation per line, prints one result per line.
# Real threads are not deterministic, so Table drives the steps one at a time;
# "threads" runs real philosophers with each fix, which always all eat.
import sys

from dining import Table, dine


def show(c):
    name = lambda t: "-" if t is None else f"P{t + 1}"
    forks = ",".join(name(h) for h in c.holder)
    waiting = ",".join(f"P{t + 1}:{w}" for t, w in enumerate(c.waits) if w) or "-"
    ate = ",".join(name(t) for t in c.ate) or "-"
    seats = f" waiter={c.seats}" if c.fix == "waiter" else ""
    return f"forks={forks} waiting={waiting} ate={ate}{seats}"


def main():
    out = []
    n, fix, c = 3, "none", None
    for raw in sys.stdin:
        parts = raw.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            n, fix = int(args[0]), args[1]
            c = Table(n, fix)
        elif op == "step":
            t = int(args[0]) - 1
            if t >= n:
                out.append("none")
            elif c.step(t):
                out.append(show(c))
            else:
                out.append("waits" if c.waits[t] else "done")
        elif op == "run":
            c = Table(n, fix)
            ok = all(0 <= int(d) - 1 < n and c.step(int(d) - 1) for d in args[0])
            out.append(show(c) if ok else "stopped")
        elif op == "reset":
            c = Table(n, fix)
            out.append("free")
        elif op == "threads":
            meals = 200
            fed = all(m == meals for f in ("order", "waiter") for m in dine(n, meals, f))
            out.append("fed" if fed else "hungry")
    print("\n".join(out))


main()
