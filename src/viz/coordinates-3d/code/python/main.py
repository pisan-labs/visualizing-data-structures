# Test driver: reads one operation per line, prints one result per line.
import math
import sys

from frames3d import to_local, to_world


def fixed2(x):
    """Two decimals, rounded half up the same way in every language."""
    r = math.floor(x * 100 + 0.5)
    return f"{'-' if r < 0 else ''}{abs(r) // 100}.{abs(r) % 100:02d}"


def main():
    frame = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, n = parts[0], [float(t) for t in parts[1:]]
        if op == "frame":
            frame = (tuple(n[0:3]), tuple(n[3:6]), tuple(n[6:9]), tuple(n[9:12]))
        elif op == "local":
            out.append(" ".join(fixed2(c) for c in to_local(*frame, tuple(n))))
        elif op == "world":
            out.append(" ".join(fixed2(c) for c in to_world(*frame, tuple(n))))
    sys.stdout.write("".join(line + "\n" for line in out))


main()
