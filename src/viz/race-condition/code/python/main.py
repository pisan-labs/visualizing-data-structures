# Test driver: reads one operation per line, prints one result per line.
# Real threads are not deterministic, so the steps are driven one at a time here, and
# the real threads run one at a time (each joined before the next starts).
import sys

from race import Race, outcomes


def main():
    out = []
    threads = times = 0
    c = None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            threads, times = int(args[0]), int(args[1])
            c = Race(threads, times)
        elif op == "step":
            t = int(args[0]) - 1
            if t >= threads:
                out.append("none")
            elif c.step(t):
                out.append(f"count={c.count} r={c.reg[t]}")
            else:
                out.append("done")
        elif op == "run":
            c = Race(threads, times)
            ok = all(0 <= int(d) - 1 < threads and c.step(int(d) - 1) for d in args[0])
            out.append(f"count={c.count}" if ok else "stopped")
        elif op == "every":
            found = outcomes(c)
            out.append(" ".join(f"{k}:{found[k]}" for k in sorted(found)))
        elif op == "reset":
            c = Race(threads, times)
            out.append("count=0")
        elif op == "threads":
            out.append(str(Race(threads, times).run_threads(one_at_a_time=True)))
    print("\n".join(out))


main()
