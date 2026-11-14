# Test driver: reads one operation per line, prints one result per line.
# Real threads are not deterministic, so Steps drives the steps one at a time;
# "threads" runs real threads with the cas loop, which never lose an update.
import sys

from cas import Steps, run_threads


def show(c):
    return f"n={c.n} retries={','.join(str(r) for r in c.retries)}"


def main():
    out = []
    k, cas, c = 2, True, None
    for raw in sys.stdin:
        parts = raw.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            cas, k = args[0] != "plain", int(args[1])
            c = Steps(k, cas)
        elif op == "step":
            t = int(args[0]) - 1
            if t >= k:
                out.append("none")
            else:
                out.append(show(c) if c.step(t) else "done")
        elif op == "run":
            c = Steps(k, cas)
            ok = all(0 <= int(d) - 1 < k and c.step(int(d) - 1) for d in args[0])
            out.append(show(c) if ok else "stopped")
        elif op == "reset":
            c = Steps(k, cas)
            out.append("n=0")
        elif op == "threads":
            k, times = int(args[0]), 1000
            out.append("ok" if run_threads(k, times) == k * times else "lost")
    print("\n".join(out))


main()
