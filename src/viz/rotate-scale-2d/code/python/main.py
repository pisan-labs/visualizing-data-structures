# Test driver: reads one operation per line, prints one result per line.
import math
import sys

from transform import rotate, scale


def fixed2(x):
    """Two decimals, rounded half up the same way in every language."""
    r = math.floor(x * 100 + 0.5)
    return f"{'-' if r < 0 else ''}{abs(r) // 100}.{abs(r) % 100:02d}"


def show(points):
    return " ".join(f"{fixed2(x)},{fixed2(y)}" for x, y in points)


def main():
    points = []
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, n = parts[0], [float(t) for t in parts[1:]]
        if op == "shape":
            points = list(zip(n[0::2], n[1::2]))
        elif op == "rotate":
            points = rotate(points, n[0], (n[1], n[2]))
            out.append(show(points))
        elif op == "scale":
            points = scale(points, n[0], n[1], (n[2], n[3]))
            out.append(show(points))
        elif op == "order":
            c = (n[3], n[4])
            first = scale(rotate(points, n[0], c), n[1], n[2], c)
            second = rotate(scale(points, n[1], n[2], c), n[0], c)
            out.append(show(first) + " | " + show(second))
    sys.stdout.write("".join(line + "\n" for line in out))


main()
