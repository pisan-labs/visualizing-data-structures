# Test driver: reads one operation per line, prints one result per line.
import math
import sys

from transform3d import apply, multiply, rotation, scaling

IDENTITY = scaling(1.0, 1.0, 1.0)


def fixed2(x):
    """Two decimals, rounded half up the same way in every language."""
    r = math.floor(x * 100 + 0.5)
    return f"{'-' if r < 0 else ''}{abs(r) // 100}.{abs(r) % 100:02d}"


def show(m, shape):
    return " ".join(",".join(fixed2(c) for c in apply(m, p)) for p in shape)


def main():
    shape, m, out = [], IDENTITY, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "rotate":
            m = multiply(rotation(parts[1], float(parts[2])), m)
            out.append(show(m, shape))
            continue
        n = [float(t) for t in parts[1:]]
        if op == "shape":
            shape, m = list(zip(n[0::3], n[1::3], n[2::3])), IDENTITY
        elif op == "scale":
            m = multiply(scaling(n[0], n[1], n[2]), m)
            out.append(show(m, shape))
        elif op == "order":
            rx, ry = rotation("x", n[0]), rotation("y", n[0])
            first = multiply(ry, multiply(rx, m))
            second = multiply(rx, multiply(ry, m))
            out.append(show(first, shape) + " | " + show(second, shape))
    sys.stdout.write("".join(line + "\n" for line in out))


main()
