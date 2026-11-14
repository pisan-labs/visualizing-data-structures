# Test driver: reads one operation per line, prints one result per line.
# Real threads are not deterministic, so Steps drives the five steps one at a time;
# "threads" runs Counter on real threads at once, which the lock keeps right.
import sys

from counter import Steps, run_threads


def show(c):
    name = lambda t: "-" if t is None else f"T{t + 1}"
    line = ",".join(name(t) for t in c.line) or "-"
    return f"count={c.count} holder={name(c.holder)} line={line}"


def main():
    out = []
    k = 0
    c = None
    for raw in sys.stdin:
        parts = raw.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            k = int(args[0])
            c = Steps(k)
        elif op == "step":
            t = int(args[0]) - 1
            if t >= k:
                out.append("none")
            elif c.step(t):
                out.append(show(c))
            else:
                out.append("waits" if t in c.line else "done")
        elif op == "run":
            c = Steps(k)
            ok = all(0 <= int(d) - 1 < k and c.step(int(d) - 1) for d in args[0])
            out.append(show(c) if ok else "stopped")
        elif op == "reset":
            c = Steps(k)
            out.append("count=0")
        elif op == "threads":
            out.append(str(run_threads(k)))
    print("\n".join(out))


main()
