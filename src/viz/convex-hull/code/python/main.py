# Test driver: reads one operation per line, prints one result per line.
import sys

from convex_hull import graham_scan


def main():
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] != "hull":
            continue
        nums = [int(t) for t in parts[1:]]
        points = list(zip(nums[0::2], nums[1::2]))
        hull = graham_scan(points)
        out.append(" ".join(f"{x},{y}" for x, y in hull) if hull else "empty")
    sys.stdout.write("".join(line + "\n" for line in out))


main()
