# Test driver: reads one operation per line, prints one result per line.
# "load n <n * n numbers, worker by worker>" sets the gradients (no output).
# "scatter", "gather" and "allreduce" run that part, skipping what has already
# run, and print every worker's vector, " / " between workers.
import sys

from ring_allreduce import all_gather, reduce_scatter


def main():
    v, phase = [], "start"
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "load":
            n = int(args[0])
            nums = [int(x) for x in args[1:]]
            v = [nums[i * n:(i + 1) * n] for i in range(n)]
            phase = "start"
            continue
        if op == "scatter" and phase == "start":
            reduce_scatter(v)
            phase = "scattered"
        elif op in ("gather", "allreduce") and phase != "done":
            if phase == "start":
                reduce_scatter(v)
            all_gather(v)
            phase = "done"
        print(" / ".join(" ".join(str(x) for x in row) for row in v))


main()
