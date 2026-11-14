# Test driver: reads one operation per line, prints one result per line.
# Real threads are not deterministic, so Steps drives the steps one at a time;
# "threads" runs real threads at both barriers, where nobody goes on early.
import sys

from barrier import Steps, run_threads


def names(ts):
    return ",".join(f"T{t + 1}" for t in ts) or "-"


def show(c):
    early = [t for t in range(3) if c.early[t]]
    return f"count={c.count} b={c.b} waiting={names(c.line)} early={names(early)}"


def main():
    out = []
    naive, c = False, None
    for raw in sys.stdin:
        parts = raw.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            naive = args[1] == "1"
            c = Steps(naive)
        elif op == "step":
            t = int(args[0]) - 1
            if t >= 3:
                out.append("none")
            elif c.step(t):
                out.append(show(c))
            else:
                out.append("waits" if c.blocked[t] else "done")
        elif op == "run":
            c = Steps(naive)
            ok = all(0 <= int(d) - 1 < 3 and c.step(int(d) - 1) for d in args[0])
            out.append(show(c) if ok else "stopped")
        elif op == "reset":
            c = Steps(naive)
            out.append("count=0")
        elif op == "threads":
            out.append("ok" if run_threads(3, 100) == 0 else "early")
    print("\n".join(out))


main()
