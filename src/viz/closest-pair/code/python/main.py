# Test driver: reads one operation per line, prints one result per line.
import sys

from closest_pair import closest_pair


def main():
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] != "closest":
            continue
        nums = [int(t) for t in parts[1:]]
        points = list(zip(nums[0::2], nums[1::2]))
        out.append(str(closest_pair(points)) if len(points) >= 2 else "none")
    sys.stdout.write("".join(line + "\n" for line in out))


main()
