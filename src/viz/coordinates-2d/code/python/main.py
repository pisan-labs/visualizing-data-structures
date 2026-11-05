# Test driver: reads one operation per line, prints one result per line.
import math
import sys

from frames import Frame


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
        op, nums = parts[0], [float(t) for t in parts[1:]]
        if op == "frame":
            frame = Frame(tuple(nums[0:2]), tuple(nums[2:4]), tuple(nums[4:6]))
        elif op in ("local", "world"):
            convert = frame.to_local if op == "local" else frame.to_world
            x, y = convert((nums[0], nums[1]))
            out.append(f"{fixed2(x)} {fixed2(y)}")
    sys.stdout.write("".join(line + "\n" for line in out))


main()
