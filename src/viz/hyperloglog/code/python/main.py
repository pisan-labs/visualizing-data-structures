# Test driver: reads one operation per line, prints one result per line.
import math
import sys

from hyperloglog import HyperLogLog


def main():
    hll = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(a) for a in parts[1:]]
        if op == "new":
            hll = HyperLogLog(args[0])
        elif op == "add":
            j, rho = hll.add(args[0])
            out.append(f"{j} {rho}")
        elif op == "estimate":
            out.append(str(math.floor(hll.estimate() + 0.5)))
        elif op == "clear":
            hll = HyperLogLog(hll.b)
            out.append("ok")
    print("\n".join(out))


main()
