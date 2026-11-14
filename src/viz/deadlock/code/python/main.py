# Test driver: reads one operation per line, prints one result per line.
# Real threads are not deterministic, so Steps drives the steps one at a time;
# "threads" runs real threads that take the locks in one global order, which never deadlock.
import sys

from locks import Steps, run_threads


def orders_for(k, order):
    return [("b", "a") if order == "opposite" and t == 1 else ("a", "b") for t in range(k)]


def show(c):
    name = lambda t: "-" if t is None else f"T{t + 1}"
    waiting = ",".join(f"T{t + 1}:{w}" for t, w in enumerate(c.waits_for) if w) or "-"
    return f"a={name(c.holder['a'])} b={name(c.holder['b'])} waiting={waiting}"


def main():
    out = []
    orders = []
    c = None
    for raw in sys.stdin:
        parts = raw.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            orders = orders_for(int(args[0]), args[1])
            c = Steps(orders)
        elif op == "step":
            t = int(args[0]) - 1
            if t >= len(orders):
                out.append("none")
            elif c.step(t):
                out.append(show(c))
            else:
                out.append("waits" if c.waits_for[t] else "done")
        elif op == "run":
            c = Steps(orders)
            ok = all(0 <= int(d) - 1 < len(orders) and c.step(int(d) - 1) for d in args[0])
            out.append(show(c) if ok else "stopped")
        elif op == "cycle":
            found = c.find_cycle()
            out.append(" ".join(f"T{t + 1}" for t in found) if found else "none")
        elif op == "reset":
            c = Steps(orders)
            out.append("free")
        elif op == "threads":
            rounds = 200
            out.append("done" if run_threads(orders, rounds) == rounds * len(orders) else "lost")
    print("\n".join(out))


main()
