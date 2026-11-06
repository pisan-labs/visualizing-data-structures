# Test driver: reads one operation per line, prints one result per line.
import math
import sys

from motion import apply, inverse, multiply, rotation, rotation_about, translation

IDENTITY = translation(0.0, 0.0)


def fixed2(x):
    """Two decimals, rounded half up the same way in every language."""
    r = math.floor(x * 100 + 0.5)
    return f"{'-' if r < 0 else ''}{abs(r) // 100}.{abs(r) % 100:02d}"


def show(m, shape):
    return " ".join(f"{fixed2(x)},{fixed2(y)}" for x, y in (apply(m, p) for p in shape))


def main():
    shape, m, out = [], IDENTITY, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, n = parts[0], [float(t) for t in parts[1:]]
        if op == "shape":
            shape, m = list(zip(n[0::2], n[1::2])), IDENTITY
            continue
        if op == "order":
            first = multiply(translation(n[1], n[2]), multiply(rotation(n[0]), m))
            second = multiply(rotation(n[0]), multiply(translation(n[1], n[2]), m))
            out.append(show(first, shape) + " | " + show(second, shape))
            continue
        if op == "rotate":
            m = multiply(rotation(n[0]), m)
        elif op == "translate":
            m = multiply(translation(n[0], n[1]), m)
        elif op == "about":
            m = multiply(rotation_about(n[0], n[1], n[2]), m)
        elif op == "invert":
            m = multiply(inverse(m), m)
        else:
            continue
        out.append(show(m, shape))
    sys.stdout.write("".join(line + "\n" for line in out))


main()
